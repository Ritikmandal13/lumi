/**
 * ==============================================================================
 * 🤖 LUMI ROBOT — ESP32-S3 Official LiveKit WebRTC Firmware
 * ==============================================================================
 * Board: GOOUUU ESP32-S3-CAM V1.5 (ESP32-S3 N16R8, 16MB Flash, 8MB Octal PSRAM)
 * Camera: Built-in OV3660 (GPIO 4-13, 15-18)
 * Motors: L298N Dual H-Bridge (IN1=38, IN2=39, IN3=40, IN4=48)
 * Cloud: Supabase REST + LiveKit Cloud WebRTC
 * ==============================================================================
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_http_client.h"
#include "esp_http_server.h"
#include "esp_crt_bundle.h"
#include "cJSON.h"
#include "esp_camera.h"
#include "driver/ledc.h"
#include "driver/i2s_std.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include <math.h>
#include "mbedtls/base64.h"

// LiveKit SDK
#include "livekit.h"
#include "oled.h"

static const char *TAG = "LUMI_ROBOT";

// ==============================================================================
// 1. CREDENTIALS & ENDPOINTS
// ==============================================================================

// Wi-Fi credentials are kept dynamic: stored in NVS flash, or provisioned via LUMI-Setup SoftAP
#define NVS_NAMESPACE_WIFI  "lumi_wifi"
#define NVS_KEY_SSID        "ssid"
#define NVS_KEY_PASS        "pass"

static char s_wifi_ssid[64] = "";
static char s_wifi_pass[64] = "";

#define SUPABASE_BASE_URL   "https://ehqqlxcdscgsebiodxfk.supabase.co"
#define LUMI_ID             "LUMI-001"
#define DEVICE_SECRET       "x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD"

// ==============================================================================
// 2. HARDWARE PINS (From LUMI_Connection_Table.pdf)
// ==============================================================================

// Motor Driver Pins (L298N)
#define MOTOR_LEFT_IN1      38
#define MOTOR_LEFT_IN2      39
#define MOTOR_RIGHT_IN3     40
#define MOTOR_RIGHT_IN4     48

#define LEDC_TIMER          LEDC_TIMER_0
#define LEDC_MODE           LEDC_LOW_SPEED_MODE
#define LEDC_CH_IN1         LEDC_CHANNEL_0
#define LEDC_CH_IN2         LEDC_CHANNEL_1
#define LEDC_CH_IN3         LEDC_CHANNEL_2
#define LEDC_CH_IN4         LEDC_CHANNEL_3

// Speaker Amplifier Pins (MAX98357A I2S Class-D Amp)
#define AMP_I2S_BCLK_PIN    41
#define AMP_I2S_LRC_PIN     42
#define AMP_I2S_DIN_PIN     14

// Camera Pins (GOOUUU ESP32-S3-CAM Built-In OV3660)
#define CAM_PIN_PWDN        -1
#define CAM_PIN_RESET       -1
#define CAM_PIN_XCLK        15
#define CAM_PIN_SIOD        4
#define CAM_PIN_SIOC        5
#define CAM_PIN_D7          16
#define CAM_PIN_D6          17
#define CAM_PIN_D5          18
#define CAM_PIN_D4          12
#define CAM_PIN_D3          10
#define CAM_PIN_D2          8
#define CAM_PIN_D1          9
#define CAM_PIN_D0          11
#define CAM_PIN_VSYNC       6
#define CAM_PIN_HREF        7
#define CAM_PIN_PCLK        13

// ==============================================================================
// 3. MOTOR CONTROLLER & TRICKS ENGINE
// ==============================================================================

// Fast hardware clamping on first boot to guarantee ZERO motor twitch/spin
static void early_clamp_motor_pins(void) {
    const gpio_num_t motor_pins[4] = {
        (gpio_num_t)MOTOR_LEFT_IN1,
        (gpio_num_t)MOTOR_LEFT_IN2,
        (gpio_num_t)MOTOR_RIGHT_IN3,
        (gpio_num_t)MOTOR_RIGHT_IN4
    };
    for (int i = 0; i < 4; i++) {
        gpio_reset_pin(motor_pins[i]);
        gpio_set_direction(motor_pins[i], GPIO_MODE_OUTPUT);
        gpio_set_pull_mode(motor_pins[i], GPIO_PULLDOWN_ONLY);
        gpio_set_level(motor_pins[i], 0);
    }
}

// Extinguish the onboard WS2812 RGB LED sharing GPIO 48 without driving motor
static void ws2812_turn_off_gpio48(void) {
    gpio_reset_pin(GPIO_NUM_48);
    gpio_set_direction(GPIO_NUM_48, GPIO_MODE_OUTPUT);
    gpio_set_pull_mode(GPIO_NUM_48, GPIO_PULLDOWN_ONLY);
    gpio_set_level(GPIO_NUM_48, 0);
}

// Robot Gesture / Trick Engine
typedef enum {
    GESTURE_NONE = 0,
    GESTURE_SPIN_360,
    GESTURE_SURVEILLANCE_360
} robot_gesture_t;

static robot_gesture_t s_active_gesture = GESTURE_NONE;
static uint32_t s_gesture_start_ms = 0;
static uint32_t s_gesture_duration_ms = 0;
static uint32_t s_last_drive_ms = 0;
static bool s_motors_active = false;

static void motor_watchdog_task(void *pvParameters);

static void set_motor_speeds(int left_pwm, bool left_fwd, int right_pwm, bool right_fwd) {
    if (left_pwm <= 0) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, 0);
    } else if (left_fwd) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, left_pwm);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, 0);
    } else {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, left_pwm);
    }

    if (right_pwm <= 0) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, 0);
    } else if (right_fwd) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, right_pwm);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, 0);
    } else {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, right_pwm);
    }

    ledc_update_duty(LEDC_MODE, LEDC_CH_IN1);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN2);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN3);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN4);
}

static void stop_motors(void) {
    s_motors_active = false;
    s_active_gesture = GESTURE_NONE;
    set_motor_speeds(0, true, 0, true);
}

static void cancel_active_gesture(void) {
    if (s_active_gesture != GESTURE_NONE) {
        s_active_gesture = GESTURE_NONE;
        stop_motors();
        oled_set_emotion_by_name("neutral");
    }
}

static void start_gesture(robot_gesture_t gesture) {
    cancel_active_gesture();
    s_active_gesture = gesture;
    s_gesture_start_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
    s_motors_active = true;
    s_last_drive_ms = s_gesture_start_ms;

    if (gesture == GESTURE_SPIN_360) {
        s_gesture_duration_ms = 950;
        ESP_LOGI(TAG, "🌀 Trick: Executing 360 Spin (fast rotation, 950ms)");
        oled_set_emotion_by_name("excited");
        // Left FWD 235 duty, Right REV 235 duty
        set_motor_speeds(235, true, 235, false);
    } else if (gesture == GESTURE_SURVEILLANCE_360) {
        s_gesture_duration_ms = 4800;
        ESP_LOGI(TAG, "👀 Trick: Executing 360 Surveillance Scan (smooth panoramic, 4800ms)");
        oled_set_emotion_by_name("curious");
        // Left FWD 155 duty, Right REV 155 duty (slow and steady for camera clarity)
        set_motor_speeds(155, true, 155, false);
    }
}

static void init_motors(void) {
    // Extinguish the onboard WS2812 LED without pulsing motor pins
    ws2812_turn_off_gpio48();

    ledc_timer_config_t timer_conf = {
        .speed_mode = LEDC_MODE,
        .duty_resolution = LEDC_TIMER_8_BIT, // 0-255
        .timer_num = LEDC_TIMER,
        .freq_hz = 1000,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&timer_conf);

    int pins[4] = {MOTOR_LEFT_IN1, MOTOR_LEFT_IN2, MOTOR_RIGHT_IN3, MOTOR_RIGHT_IN4};
    ledc_channel_t chs[4] = {LEDC_CH_IN1, LEDC_CH_IN2, LEDC_CH_IN3, LEDC_CH_IN4};

    for (int i = 0; i < 4; i++) {
        ledc_channel_config_t ch_conf = {
            .gpio_num = pins[i],
            .speed_mode = LEDC_MODE,
            .channel = chs[i],
            .intr_type = LEDC_INTR_DISABLE,
            .timer_sel = LEDC_TIMER,
            .duty = 0,
            .hpoint = 0
        };
        ledc_channel_config(&ch_conf);
    }
    ESP_LOGI(TAG, "Motors initialized safely on GPIO 38, 39, 40, 48 (duty=0).");
    xTaskCreate(motor_watchdog_task, "motor_wdg", 2048, NULL, 3, NULL);
}

static void motor_watchdog_task(void *pvParameters) {
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(50));
        uint32_t now = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

        // Handle active gesture completion
        if (s_active_gesture != GESTURE_NONE) {
            if (now - s_gesture_start_ms >= s_gesture_duration_ms) {
                ESP_LOGI(TAG, "✅ Trick gesture completed smoothly");
                s_active_gesture = GESTURE_NONE;
                stop_motors();
                oled_set_emotion_by_name("happy");
            }
            continue;
        }

        // Handle normal joystick watchdog timeout (800ms silence)
        if (s_motors_active) {
            if (now - s_last_drive_ms > 800) {
                stop_motors();
                ESP_LOGW(TAG, "⏱️ Motor watchdog: auto-stopped motors after 800ms silence");
            }
        }
    }
}

static void apply_differential_drive(float x, float y) {
    // Immediate override: joystick movement instantly aborts any playing trick
    if (s_active_gesture != GESTURE_NONE) {
        cancel_active_gesture();
    }

    if (fabsf(x) < 0.05f && fabsf(y) < 0.05f) {
        stop_motors();
        return;
    }

    s_last_drive_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
    s_motors_active = true;

    float left = y + x;
    float right = y - x;

    if (left > 1.0f) left = 1.0f;
    if (left < -1.0f) left = -1.0f;
    if (right > 1.0f) right = 1.0f;
    if (right < -1.0f) right = -1.0f;

    // L298N has ~1.8V internal drop across bipolar transistors.
    // On 5V supply, hobby DC gear motors stall below ~120 PWM duty.
    // Scale active duty from MIN_PWM (120) to MAX_PWM (255).
    const int MIN_PWM = 120;
    const int MAX_PWM = 255;

    int left_pwm = 0;
    if (fabsf(left) >= 0.05f) {
        left_pwm = MIN_PWM + (int)(fabsf(left) * (MAX_PWM - MIN_PWM));
        if (left_pwm > 255) left_pwm = 255;
    }

    int right_pwm = 0;
    if (fabsf(right) >= 0.05f) {
        right_pwm = MIN_PWM + (int)(fabsf(right) * (MAX_PWM - MIN_PWM));
        if (right_pwm > 255) right_pwm = 255;
    }

    ESP_LOGI(TAG, "🕹️ Drive: x=%.2f, y=%.2f | L=%d (%s), R=%d (%s)",
             x, y,
             left_pwm, left >= 0 ? "FWD" : "REV",
             right_pwm, right >= 0 ? "FWD" : "REV");

    set_motor_speeds(left_pwm, left >= 0, right_pwm, right >= 0);
}

// ==============================================================================
// 3B. SPEAKER & I2S AUDIO CONTROLLER (MAX98357A)
// ==============================================================================

static i2s_chan_handle_t s_i2s_tx_handle = NULL;

static void play_tone(uint32_t freq_hz, uint32_t duration_ms) {
    if (!s_i2s_tx_handle) return;
    int samples_count = (16000 * duration_ms) / 1000;
    int16_t *buf = malloc(samples_count * 2 * sizeof(int16_t));
    if (!buf) return;

    for (int i = 0; i < samples_count; i++) {
        float sample = sinf(2.0f * (float)M_PI * (float)freq_hz * ((float)i / 16000.0f));
        int16_t val = (int16_t)(sample * 10000.0f);
        buf[i * 2]     = val; // Left
        buf[i * 2 + 1] = val; // Right
    }

    size_t written = 0;
    i2s_channel_write(s_i2s_tx_handle, buf, samples_count * 2 * sizeof(int16_t), &written, pdMS_TO_TICKS(duration_ms + 100));
    free(buf);
}

static void play_robot_greeting_chime(void) {
    ESP_LOGI(TAG, "🎵 Playing robot boot chime through MAX98357A speaker...");
    play_tone(523, 100);
    vTaskDelay(pdMS_TO_TICKS(30));
    play_tone(659, 100);
    vTaskDelay(pdMS_TO_TICKS(30));
    play_tone(784, 180);
}

static void play_connected_chime(void) {
    play_tone(659, 100);
    vTaskDelay(pdMS_TO_TICKS(30));
    play_tone(880, 150);
}

// Audio Echo Cancellation (AEC) & Half-duplex Ducking state
static bool s_is_user_speaking = false;
static uint32_t s_last_speaker_play_ms = 0;
static uint32_t s_last_interaction_ms = 0;
static bool s_is_in_thinking_mode = false;

// Synthesize a cute, curious "hmmm..." vocal inflection
static void play_cute_hmmm_sound(void) {
    if (!s_i2s_tx_handle) return;
    s_last_speaker_play_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

    // Vocal sweep: soft glide 310Hz -> 280Hz -> 430Hz over 450ms with smooth sine envelope
    const int step_samples = 160; // 10ms at 16kHz
    int16_t step_buf[step_samples * 2];
    float phase = 0.0f;

    for (int step = 0; step < 45; step++) {
        float progress = (float)step / 45.0f;
        float freq;
        if (progress < 0.35f) {
            freq = 310.0f - (30.0f * (progress / 0.35f));
        } else {
            freq = 280.0f + (150.0f * ((progress - 0.35f) / 0.65f));
        }
        float envelope = sinf((float)M_PI * progress);
        float vol = envelope * 4500.0f; // Soft, friendly level

        for (int i = 0; i < step_samples; i++) {
            phase += 2.0f * (float)M_PI * freq / 16000.0f;
            if (phase > 2.0f * (float)M_PI) phase -= 2.0f * (float)M_PI;
            int16_t sample = (int16_t)(sinf(phase) * vol);
            step_buf[i * 2]     = sample;
            step_buf[i * 2 + 1] = sample;
        }
        size_t written = 0;
        i2s_channel_write(s_i2s_tx_handle, step_buf, sizeof(step_buf), &written, pdMS_TO_TICKS(25));
    }
}

static esp_err_t init_speaker_audio(void) {
    ESP_LOGI(TAG, "Initializing MAX98357A I2S Audio Speaker (BCLK: 41, LRC: 42, DIN: 14)...");

    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    chan_cfg.auto_clear = true;
    esp_err_t err = i2s_new_channel(&chan_cfg, &s_i2s_tx_handle, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to create I2S TX channel: 0x%x", err);
        return err;
    }

    i2s_std_config_t std_cfg = {
        .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(16, I2S_SLOT_MODE_STEREO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = (gpio_num_t)AMP_I2S_BCLK_PIN,
            .ws   = (gpio_num_t)AMP_I2S_LRC_PIN,
            .dout = (gpio_num_t)AMP_I2S_DIN_PIN,
            .din  = I2S_GPIO_UNUSED,
        },
    };
    err = i2s_channel_init_std_mode(s_i2s_tx_handle, &std_cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to init I2S std mode: 0x%x", err);
        return err;
    }

    err = i2s_channel_enable(s_i2s_tx_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to enable I2S TX channel: 0x%x", err);
        return err;
    }

    // Play pleasant greeting chime so client verifies speaker hardware on boot
    play_robot_greeting_chime();

    return ESP_OK;
}

// ==============================================================================
// 4. CAMERA SETUP (OV3660)
// ==============================================================================

static esp_err_t init_camera(void) {
    camera_config_t config = {
        .pin_pwdn = CAM_PIN_PWDN,
        .pin_reset = CAM_PIN_RESET,
        .pin_xclk = CAM_PIN_XCLK,
        .pin_sccb_sda = CAM_PIN_SIOD,
        .pin_sccb_scl = CAM_PIN_SIOC,
        .pin_d7 = CAM_PIN_D7,
        .pin_d6 = CAM_PIN_D6,
        .pin_d5 = CAM_PIN_D5,
        .pin_d4 = CAM_PIN_D4,
        .pin_d3 = CAM_PIN_D3,
        .pin_d2 = CAM_PIN_D2,
        .pin_d1 = CAM_PIN_D1,
        .pin_d0 = CAM_PIN_D0,
        .pin_vsync = CAM_PIN_VSYNC,
        .pin_href = CAM_PIN_HREF,
        .pin_pclk = CAM_PIN_PCLK,
        .xclk_freq_hz = 10000000,
        .ledc_timer = LEDC_TIMER_3,
        .ledc_channel = LEDC_CHANNEL_7,
        .pixel_format = PIXFORMAT_JPEG,
        .frame_size = FRAMESIZE_QVGA, // 320x240 for smooth, ultra-low latency worldwide streaming
        .jpeg_quality = 22, // Optimized for smooth streaming without choking 2.4GHz Wi-Fi or SCTP buffers
        .fb_count = 2,
        .grab_mode = CAMERA_GRAB_LATEST,
        .fb_location = CAMERA_FB_IN_PSRAM
    };

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed with error 0x%x", err);
        return err;
    }

    sensor_t *s = esp_camera_sensor_get();
    if (s != NULL) {
        s->set_vflip(s, 1);    // 180° rotation
        s->set_hmirror(s, 1);  // 180° rotation
    }
    ESP_LOGI(TAG, "OV3660 camera initialized successfully!");
    return ESP_OK;
}

// ==============================================================================
// 4B. CAMERA HTTP STREAM SERVER (MJPEG on port 81)
// ==============================================================================

static SemaphoreHandle_t s_camera_mutex = NULL;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static esp_err_t jpg_stream_httpd_handler(httpd_req_t *req) {
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    char part_buf[128];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if (res != ESP_OK) return res;
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    while (true) {
        if (s_camera_mutex && xSemaphoreTake(s_camera_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            fb = esp_camera_fb_get();
            if (!fb) {
                xSemaphoreGive(s_camera_mutex);
                ESP_LOGE(TAG, "Camera capture failed");
                res = ESP_FAIL;
                break;
            }

            if (res == ESP_OK) {
                res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
            }
            if (res == ESP_OK) {
                size_t hlen = snprintf(part_buf, sizeof(part_buf), _STREAM_PART, (unsigned int)fb->len);
                res = httpd_resp_send_chunk(req, part_buf, hlen);
            }
            if (res == ESP_OK) {
                res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
            }
            esp_camera_fb_return(fb);
            fb = NULL;
            xSemaphoreGive(s_camera_mutex);
        }
        if (res != ESP_OK) break;
        vTaskDelay(pdMS_TO_TICKS(50)); // ~20 FPS
    }
    return res;
}

static esp_err_t jpg_snapshot_httpd_handler(httpd_req_t *req) {
    camera_fb_t *fb = NULL;
    if (s_camera_mutex && xSemaphoreTake(s_camera_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        fb = esp_camera_fb_get();
        if (!fb) {
            xSemaphoreGive(s_camera_mutex);
            httpd_resp_send_500(req);
            return ESP_FAIL;
        }
        httpd_resp_set_type(req, "image/jpeg");
        httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
        httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
        esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
        esp_camera_fb_return(fb);
        xSemaphoreGive(s_camera_mutex);
        return res;
    }
    httpd_resp_send_500(req);
    return ESP_FAIL;
}

static httpd_handle_t start_camera_server(void) {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 81;
    config.ctrl_port = 32769;
    config.max_open_sockets = 4;
    config.stack_size = 8192;

    httpd_handle_t stream_httpd = NULL;
    if (httpd_start(&stream_httpd, &config) == ESP_OK) {
        httpd_uri_t stream_uri = {
            .uri = "/stream",
            .method = HTTP_GET,
            .handler = jpg_stream_httpd_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(stream_httpd, &stream_uri);

        httpd_uri_t snap_uri = {
            .uri = "/capture",
            .method = HTTP_GET,
            .handler = jpg_snapshot_httpd_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(stream_httpd, &snap_uri);
        ESP_LOGI(TAG, "🎥 Camera MJPEG HTTP stream server started on port 81");
    }
    return stream_httpd;
}

// ==============================================================================
// 5. WI-FI PROVISIONING, NVS FLASH PERSISTENCE & CAPTIVE PORTAL
// ==============================================================================

static EventGroupHandle_t s_wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0
static char s_robot_ip[32] = "127.0.0.1";
static httpd_handle_t s_prov_httpd = NULL;

static esp_err_t load_wifi_credentials_nvs(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE_WIFI, NVS_READONLY, &nvs_handle);
    if (err == ESP_OK) {
        size_t ssid_len = sizeof(s_wifi_ssid);
        size_t pass_len = sizeof(s_wifi_pass);
        if (nvs_get_str(nvs_handle, NVS_KEY_SSID, s_wifi_ssid, &ssid_len) == ESP_OK && strlen(s_wifi_ssid) > 0) {
            nvs_get_str(nvs_handle, NVS_KEY_PASS, s_wifi_pass, &pass_len);
            ESP_LOGI(TAG, "📂 Loaded Wi-Fi credentials from NVS: SSID=[%s]", s_wifi_ssid);
        } else {
            s_wifi_ssid[0] = '\0';
            s_wifi_pass[0] = '\0';
            ESP_LOGW(TAG, "No Wi-Fi credentials saved in NVS flash. Setup hotspot required.");
        }
        nvs_close(nvs_handle);
        return ESP_OK;
    }
    s_wifi_ssid[0] = '\0';
    s_wifi_pass[0] = '\0';
    ESP_LOGW(TAG, "No NVS partition found for Wi-Fi. Setup hotspot required.");
    return err;
}

static esp_err_t save_wifi_credentials_nvs(const char *ssid, const char *pass) {
    if (!ssid || strlen(ssid) == 0) return ESP_ERR_INVALID_ARG;
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE_WIFI, NVS_READWRITE, &nvs_handle);
    if (err == ESP_OK) {
        nvs_set_str(nvs_handle, NVS_KEY_SSID, ssid);
        nvs_set_str(nvs_handle, NVS_KEY_PASS, pass ? pass : "");
        err = nvs_commit(nvs_handle);
        nvs_close(nvs_handle);
        strncpy(s_wifi_ssid, ssid, sizeof(s_wifi_ssid) - 1);
        strncpy(s_wifi_pass, pass ? pass : "", sizeof(s_wifi_pass) - 1);
        ESP_LOGI(TAG, "💾 Saved new Wi-Fi credentials to NVS: SSID=[%s]", ssid);
        return err;
    }
    ESP_LOGE(TAG, "Failed to open NVS for writing: 0x%x", err);
    return err;
}

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        snprintf(s_robot_ip, sizeof(s_robot_ip), IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "🎉 Connected to Wi-Fi! Robot IP: %s", s_robot_ip);
    }
}

// Modern, mobile-responsive HTML Captive Portal for LUMI Wi-Fi setup
static const char PROV_HTML_PAGE[] =
"<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,user-scalable=no\">"
"<title>LUMI Wi-Fi Setup</title><style>"
"*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif}"
"body{background:#0F172A;color:#F8FAFC;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}"
".card{background:#1E293B;border-radius:24px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.5);border:1px solid #334155;text-align:center}"
".logo{font-size:46px;margin-bottom:8px}"
"h1{font-size:22px;font-weight:800;color:#FFFFFF;margin-bottom:4px;letter-spacing:-0.3px}"
"p{font-size:13px;color:#94A3B8;margin-bottom:22px}"
"label{display:block;text-align:left;font-size:12px;font-weight:700;color:#94A3B8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}"
"select,input{width:100%;padding:13px 14px;background:#0F172A;border:1.5px solid #334155;border-radius:14px;color:#FFF;font-size:15px;margin-bottom:16px;outline:none;transition:border 0.2s}"
"select:focus,input:focus{border-color:#634AF6}"
".btn{width:100%;padding:14px;background:#634AF6;color:#FFF;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(99,74,246,0.45);margin-top:6px}"
".btn:active{transform:scale(0.98)}"
".status{margin-top:16px;font-size:13px;font-weight:600;min-height:22px}"
".success{color:#10B981}"
".error{color:#EF4444}"
".scanning{color:#A78BFA}"
"</style></head><body>"
"<div class=\"card\">"
"<div class=\"logo\">🤖</div>"
"<h1>Connect LUMI</h1>"
"<p>Select your Hotspot or Wi-Fi network</p>"
"<label for=\"scanned\">Nearby Networks</label>"
"<select id=\"scanned\" onchange=\"pickNet(this.value)\"><option value=\"\">Scanning Wi-Fi...</option></select>"
"<label for=\"ssid\">Network Name (SSID)</label>"
"<input type=\"text\" id=\"ssid\" placeholder=\"Hotspot / Wi-Fi Name\" autocomplete=\"off\" autocorrect=\"off\">"
"<label for=\"pass\">Password</label>"
"<input type=\"password\" id=\"pass\" placeholder=\"Password (leave blank if open)\">"
"<button class=\"btn\" id=\"subBtn\" onclick=\"saveConfig()\">Connect LUMI</button>"
"<div class=\"status\" id=\"status\"></div>"
"</div>"
"<script>"
"function pickNet(v){if(v)document.getElementById('ssid').value=v;}"
"function scan(){"
"fetch('/scan').then(function(r){return r.json();}).then(function(nets){"
"var sel=document.getElementById('scanned');sel.innerHTML='<option value=\"\">-- Pick Scanned Network --</option>';"
"if(nets&&nets.length){nets.forEach(function(n){var o=document.createElement('option');o.value=n.ssid;o.text=n.ssid+' ('+n.rssi+' dBm)';sel.appendChild(o);});}"
"else{sel.innerHTML='<option value=\"\">No networks found (type below)</option>';}"
"}).catch(function(){document.getElementById('scanned').innerHTML='<option value=\"\">Type Hotspot Name Below</option>';});}"
"scan();"
"function saveConfig(){"
"var s=document.getElementById('ssid').value.trim();var p=document.getElementById('pass').value;"
"var st=document.getElementById('status');var btn=document.getElementById('subBtn');"
"if(!s){st.className='status error';st.innerText='Please enter a Wi-Fi name';return;}"
"btn.disabled=true;st.className='status scanning';st.innerText='Connecting LUMI to '+s+'...';"
"fetch('/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:s,pass:p})})"
".then(function(r){return r.json();}).then(function(){st.className='status success';st.innerText='Saved! Watch LUMI\\'s face for code.';})"
".catch(function(){st.className='status success';st.innerText='Submitted! Connecting now...';});"
"}"
"</script></body></html>";

static esp_err_t prov_index_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, PROV_HTML_PAGE, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t prov_scan_handler(httpd_req_t *req) {
    wifi_scan_config_t scan_config = {
        .ssid = NULL,
        .bssid = NULL,
        .channel = 0,
        .show_hidden = false
    };
    esp_wifi_scan_start(&scan_config, true);
    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);
    if (ap_count > 12) ap_count = 12;

    cJSON *arr = cJSON_CreateArray();
    if (ap_count > 0) {
        wifi_ap_record_t *ap_records = malloc(sizeof(wifi_ap_record_t) * ap_count);
        if (ap_records) {
            esp_wifi_scan_get_ap_records(&ap_count, ap_records);
            for (int i = 0; i < ap_count; i++) {
                if (strlen((char *)ap_records[i].ssid) > 0) {
                    cJSON *item = cJSON_CreateObject();
                    cJSON_AddStringToObject(item, "ssid", (char *)ap_records[i].ssid);
                    cJSON_AddNumberToObject(item, "rssi", ap_records[i].rssi);
                    cJSON_AddItemToArray(arr, item);
                }
            }
            free(ap_records);
        }
    }
    char *json_str = cJSON_PrintUnformatted(arr);
    cJSON_Delete(arr);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    if (json_str) {
        httpd_resp_send(req, json_str, strlen(json_str));
        free(json_str);
    } else {
        httpd_resp_send(req, "[]", 2);
    }
    return ESP_OK;
}

static esp_err_t prov_connect_handler(httpd_req_t *req) {
    char buf[256];
    int ret = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (ret <= 0) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    buf[ret] = '\0';

    cJSON *json = cJSON_Parse(buf);
    if (!json) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
        return ESP_FAIL;
    }

    cJSON *s = cJSON_GetObjectItem(json, "ssid");
    cJSON *p = cJSON_GetObjectItem(json, "pass");
    if (!s || !s->valuestring || strlen(s->valuestring) == 0) {
        cJSON_Delete(json);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing SSID");
        return ESP_FAIL;
    }

    const char *new_ssid = s->valuestring;
    const char *new_pass = p && p->valuestring ? p->valuestring : "";

    save_wifi_credentials_nvs(new_ssid, new_pass);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_send(req, "{\"status\":\"ok\",\"message\":\"Connecting to Wi-Fi...\"}", HTTPD_RESP_USE_STRLEN);
    cJSON_Delete(json);

    // Apply to station and trigger connect
    wifi_config_t sta_conf = {0};
    strncpy((char *)sta_conf.sta.ssid, new_ssid, sizeof(sta_conf.sta.ssid) - 1);
    strncpy((char *)sta_conf.sta.password, new_pass, sizeof(sta_conf.sta.password) - 1);

    ESP_LOGI(TAG, "📡 SoftAP: Switching to user network [%s]...", new_ssid);
    esp_wifi_disconnect();
    esp_wifi_set_config(WIFI_IF_STA, &sta_conf);
    esp_wifi_connect();

    return ESP_OK;
}

static esp_err_t captive_redirect_handler(httpd_req_t *req) {
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

static httpd_handle_t start_wifi_prov_portal(void) {
    if (s_prov_httpd) return s_prov_httpd;

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    config.ctrl_port = 32770;
    config.max_open_sockets = 4;
    config.stack_size = 6144;

    if (httpd_start(&s_prov_httpd, &config) == ESP_OK) {
        httpd_uri_t index_uri = {
            .uri = "/",
            .method = HTTP_GET,
            .handler = prov_index_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(s_prov_httpd, &index_uri);

        httpd_uri_t scan_uri = {
            .uri = "/scan",
            .method = HTTP_GET,
            .handler = prov_scan_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(s_prov_httpd, &scan_uri);

        httpd_uri_t conn_uri = {
            .uri = "/connect",
            .method = HTTP_POST,
            .handler = prov_connect_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(s_prov_httpd, &conn_uri);

        httpd_uri_t g204_uri = {
            .uri = "/generate_204",
            .method = HTTP_GET,
            .handler = captive_redirect_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(s_prov_httpd, &g204_uri);

        httpd_uri_t apple_uri = {
            .uri = "/hotspot-detect.html",
            .method = HTTP_GET,
            .handler = captive_redirect_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(s_prov_httpd, &apple_uri);

        ESP_LOGI(TAG, "🌐 Wi-Fi Provisioning Portal active on http://192.168.4.1:80");
    }
    return s_prov_httpd;
}

static void stop_wifi_prov_portal(void) {
    if (s_prov_httpd) {
        httpd_stop(s_prov_httpd);
        s_prov_httpd = NULL;
        ESP_LOGI(TAG, "🌐 Wi-Fi Provisioning Portal stopped.");
    }
}

static void init_wifi(void) {
    load_wifi_credentials_nvs();

    s_wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_config_t wifi_sta_config = {0};
    strncpy((char *)wifi_sta_config.sta.ssid, s_wifi_ssid, sizeof(wifi_sta_config.sta.ssid) - 1);
    strncpy((char *)wifi_sta_config.sta.password, s_wifi_pass, sizeof(wifi_sta_config.sta.password) - 1);

    wifi_config_t wifi_ap_config = {
        .ap = {
            .ssid = "LUMI-Setup",
            .ssid_len = strlen("LUMI-Setup"),
            .channel = 1,
            .password = "",
            .max_connection = 4,
            .authmode = WIFI_AUTH_OPEN
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_sta_config));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_ap_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

static char* http_post_json(const char *url, const char *json_body) {
    char *response_buffer = calloc(2048, 1);
    if (!response_buffer) return NULL;

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 10000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, json_body, strlen(json_body));

    esp_err_t err = esp_http_client_open(client, strlen(json_body));
    if (err == ESP_OK) {
        esp_http_client_write(client, json_body, strlen(json_body));
        esp_http_client_fetch_headers(client);
        int read_len = esp_http_client_read_response(client, response_buffer, 2047);
        if (read_len >= 0) response_buffer[read_len] = '\0';
    }
    esp_http_client_cleanup(client);
    return response_buffer;
}

// ==============================================================================
// 6. LIVEKIT DATA CHANNEL HANDLER (JOYSTICK DRIVING)
// ==============================================================================

static void on_data_received(const livekit_data_received_t *data, void *ctx) {
    if (!data || !data->payload.bytes || data->payload.size == 0) return;

    // Reset idle timer whenever user interacts with robot
    s_last_interaction_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
    if (s_is_in_thinking_mode) {
        s_is_in_thinking_mode = false;
        oled_set_emotion_by_name("happy");
    }

    // 1. Direct binary audio stream over WebRTC data channel (topic "voice_stream")
    if (data->topic && strcmp(data->topic, "voice_stream") == 0) {
        s_is_user_speaking = true;
        s_last_speaker_play_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

        if (s_i2s_tx_handle && data->payload.size > 0) {
            // Incoming phone stream is 16-bit 16kHz mono PCM.
            // Duplicate mono into stereo (Left + Right) for MAX98357A I2S DAC with digital gain boost.
            size_t mono_samples = data->payload.size / sizeof(int16_t);
            if (mono_samples > 0) {
                int16_t *stereo_buf = malloc(mono_samples * 2 * sizeof(int16_t));
                if (stereo_buf) {
                    const int16_t *mono_ptr = (const int16_t *)data->payload.bytes;
                    for (size_t i = 0; i < mono_samples; i++) {
                        int32_t boosted = (int32_t)mono_ptr[i] * 2; // +6dB gain boost for walkie-talkie projection
                        if (boosted > 32767) boosted = 32767;
                        if (boosted < -32768) boosted = -32768;
                        int16_t sample = (int16_t)boosted;
                        stereo_buf[i * 2]     = sample;
                        stereo_buf[i * 2 + 1] = sample;
                    }
                    size_t written = 0;
                    i2s_channel_write(s_i2s_tx_handle, stereo_buf, mono_samples * 2 * sizeof(int16_t), &written, pdMS_TO_TICKS(100));
                    free(stereo_buf);
                }
            }
        }
        return;
    }

    // Legacy binary audio over topic "voice" (safeguard against JSON {"...)
    if (data->topic && strcmp(data->topic, "voice") == 0) {
        if (data->payload.size > 2 && !(data->payload.bytes[0] == '{' && (data->payload.bytes[1] == '"' || data->payload.bytes[1] == '\''))) {
            s_is_user_speaking = true;
            s_last_speaker_play_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

            if (s_i2s_tx_handle) {
                size_t mono_samples = data->payload.size / sizeof(int16_t);
                if (mono_samples > 0) {
                    int16_t *stereo_buf = malloc(mono_samples * 2 * sizeof(int16_t));
                    if (stereo_buf) {
                        const int16_t *mono_ptr = (const int16_t *)data->payload.bytes;
                        for (size_t i = 0; i < mono_samples; i++) {
                            int32_t boosted = (int32_t)mono_ptr[i] * 2;
                            if (boosted > 32767) boosted = 32767;
                            if (boosted < -32768) boosted = -32768;
                            stereo_buf[i * 2]     = (int16_t)boosted;
                            stereo_buf[i * 2 + 1] = (int16_t)boosted;
                        }
                        size_t written = 0;
                        i2s_channel_write(s_i2s_tx_handle, stereo_buf, mono_samples * 2 * sizeof(int16_t), &written, pdMS_TO_TICKS(100));
                        free(stereo_buf);
                    }
                }
            }
            return;
        }
    }

    ESP_LOGI(TAG, "📥 Recv packet topic=%s len=%d: %.*s",
             data->topic ? data->topic : "NULL",
             (int)data->payload.size,
             (int)(data->payload.size > 60 ? 60 : data->payload.size),
             (const char*)data->payload.bytes);

    cJSON *json = cJSON_ParseWithLength((const char *)data->payload.bytes, data->payload.size);
    if (!json) {
        ESP_LOGW(TAG, "Payload could not be parsed as JSON (size %d)", (int)data->payload.size);
        return;
    }

    cJSON *t = cJSON_GetObjectItem(json, "t");
    if (t && t->valuestring) {
        if (strcmp(t->valuestring, "drive") == 0) {
            cJSON *x_item = cJSON_GetObjectItem(json, "x");
            cJSON *y_item = cJSON_GetObjectItem(json, "y");
            if (x_item && y_item) {
                float x = (float)x_item->valuedouble;
                float y = (float)y_item->valuedouble;
                apply_differential_drive(x, y);
                // Reactive Kinematic Gaze: Eyes lead turns and react to drive vector
                oled_set_gaze_offset(x, -y * 0.4f);
            }
        } else if (strcmp(t->valuestring, "stop") == 0) {
            stop_motors();
            oled_set_gaze_offset(0.0f, 0.0f);
            ESP_LOGW(TAG, "🛑 EMERGENCY / JOYSTICK STOP EXECUTED");
        } else if (strcmp(t->valuestring, "play") == 0) {
            cJSON *name_item = cJSON_GetObjectItem(json, "name");
            if (name_item && name_item->valuestring) {
                const char *gname = name_item->valuestring;
                ESP_LOGI(TAG, "🎭 Trick / gesture requested: %s", gname);
                if (strcmp(gname, "spin") == 0 || strcmp(gname, "spin_360") == 0) {
                    start_gesture(GESTURE_SPIN_360);
                } else if (strcmp(gname, "surveillance") == 0 || strcmp(gname, "surveillance_360") == 0) {
                    start_gesture(GESTURE_SURVEILLANCE_360);
                } else if (strcmp(gname, "nod") == 0) {
                    oled_set_emotion_by_name("happy");
                } else if (strcmp(gname, "shake") == 0) {
                    oled_set_emotion_by_name("upset");
                } else if (strcmp(gname, "dance") == 0) {
                    oled_set_emotion_by_name("excited");
                } else if (strcmp(gname, "peekaboo") == 0) {
                    oled_draw_wink();
                }
            }
        } else if (strcmp(t->valuestring, "mic_start") == 0) {
            s_is_user_speaking = true;
            s_last_speaker_play_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
            ESP_LOGI(TAG, "🎙️ Mic Push-to-Talk active (speaker channel open, local mic muted for AEC)");
        } else if (strcmp(t->valuestring, "mic_stop") == 0) {
            s_is_user_speaking = false;
            ESP_LOGI(TAG, "🎙️ Mic Push-to-Talk released (local mic unmuted)");
        } else if (strcmp(t->valuestring, "emotion") == 0) {
            cJSON *name = cJSON_GetObjectItem(json, "name");
            if (name && name->valuestring) {
                ESP_LOGI(TAG, "Emote Triggered (silent): %s", name->valuestring);
                oled_set_emotion_by_name(name->valuestring);
            }
        } else if (strcmp(t->valuestring, "voice") == 0) {
            s_is_user_speaking = true;
            s_last_speaker_play_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);

            // Decodes base64 PCM audio data sent from Walkie-Talkie voice clips
            cJSON *b64_item = cJSON_GetObjectItem(json, "data");
            if (b64_item && b64_item->valuestring && s_i2s_tx_handle) {
                size_t b64_len = strlen(b64_item->valuestring);
                size_t out_len = 0;
                unsigned char *out_buf = malloc(b64_len);
                if (out_buf) {
                    if (mbedtls_base64_decode(out_buf, b64_len, &out_len, (const unsigned char *)b64_item->valuestring, b64_len) == 0 && out_len > 0) {
                        // Check for WAV RIFF header
                        size_t offset = 0;
                        if (out_len > 44 && memcmp(out_buf, "RIFF", 4) == 0) {
                            for (size_t i = 12; i < out_len - 8; i++) {
                                if (memcmp(out_buf + i, "data", 4) == 0) {
                                    offset = i + 8;
                                    break;
                                }
                            }
                            if (offset == 0) offset = 44;
                        }
                        size_t pcm_len = out_len > offset ? out_len - offset : 0;
                        if (pcm_len > 0) {
                            size_t mono_samples = pcm_len / sizeof(int16_t);
                            int16_t *stereo_buf = malloc(mono_samples * 2 * sizeof(int16_t));
                            if (stereo_buf) {
                                const int16_t *mono_ptr = (const int16_t *)(out_buf + offset);
                                for (size_t i = 0; i < mono_samples; i++) {
                                    stereo_buf[i * 2]     = mono_ptr[i];
                                    stereo_buf[i * 2 + 1] = mono_ptr[i];
                                }
                                size_t written = 0;
                                i2s_channel_write(s_i2s_tx_handle, stereo_buf, mono_samples * 2 * sizeof(int16_t), &written, pdMS_TO_TICKS(200));
                                free(stereo_buf);
                            }
                        }
                    }
                    free(out_buf);
                }
            }
        } else if (strcmp(t->valuestring, "beep") == 0 || strcmp(t->valuestring, "horn") == 0) {
            play_tone(880, 250);
        } else if (strcmp(t->valuestring, "sound") == 0) {
            cJSON *freq_item = cJSON_GetObjectItem(json, "freq");
            cJSON *dur_item = cJSON_GetObjectItem(json, "dur");
            uint32_t freq = freq_item ? freq_item->valueint : 880;
            uint32_t dur = dur_item ? dur_item->valueint : 200;
            play_tone(freq, dur);
        } else if (strcmp(t->valuestring, "wifi_config") == 0) {
            cJSON *s = cJSON_GetObjectItem(json, "ssid");
            cJSON *p = cJSON_GetObjectItem(json, "pass");
            if (s && s->valuestring && strlen(s->valuestring) > 0) {
                const char *new_s = s->valuestring;
                const char *new_p = p && p->valuestring ? p->valuestring : "";
                ESP_LOGI(TAG, "📡 Live App: Switching Wi-Fi to [%s]...", new_s);
                save_wifi_credentials_nvs(new_s, new_p);

                wifi_config_t new_sta = {0};
                strncpy((char *)new_sta.sta.ssid, new_s, sizeof(new_sta.sta.ssid) - 1);
                strncpy((char *)new_sta.sta.password, new_p, sizeof(new_sta.sta.password) - 1);

                esp_wifi_disconnect();
                esp_wifi_set_config(WIFI_IF_STA, &new_sta);
                esp_wifi_connect();
            }
        }
    }
    cJSON_Delete(json);
}

static bool s_room_connected = false;
static livekit_room_handle_t s_room_handle = NULL;
static char s_livekit_url[128] = {0};
static char s_livekit_token[512] = {0};

static void on_room_state_changed(livekit_connection_state_t state, void *ctx) {
    ESP_LOGI(TAG, "LiveKit Room state changed: %s", livekit_connection_state_str(state));
    if (state == LIVEKIT_CONNECTION_STATE_CONNECTED) {
        s_room_connected = true;
        oled_set_paired(true);
        oled_set_emotion_by_name("happy");
        play_connected_chime();
    } else {
        s_room_connected = false;
    }
}

// Dedicated task for publishing camera frames worldwide over LiveKit WebRTC
static void video_stream_task(void *pvParameters) {
    (void)pvParameters;
    ESP_LOGI(TAG, "🎥 Worldwide LiveKit WebRTC Video Stream Task started on Core 1 (18 FPS smooth)");
    while (1) {
        if (s_room_connected && s_room_handle) {
            camera_fb_t *fb = NULL;
            if (s_camera_mutex && xSemaphoreTake(s_camera_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
                fb = esp_camera_fb_get();
                if (fb) {
                    livekit_data_payload_t payload = {
                        .bytes = (uint8_t*)fb->buf,
                        .size = fb->len
                    };
                    livekit_data_publish_options_t pub_opts = {
                        .payload = &payload,
                        .topic = "video",
                        .lossy = true
                    };
                    livekit_err_t res = livekit_room_publish_data(s_room_handle, &pub_opts);
                    esp_camera_fb_return(fb);
                    if (res != LIVEKIT_ERR_NONE) {
                        // SCTP send queue is temporarily full, yield slightly to let it drain cleanly
                        vTaskDelay(pdMS_TO_TICKS(75));
                    }
                }
                xSemaphoreGive(s_camera_mutex);
            }
            vTaskDelay(pdMS_TO_TICKS(55)); // ~18 FPS for buttery smooth real-time video without frame stutter
        } else {
            vTaskDelay(pdMS_TO_TICKS(150));
        }
    }
}

// ==============================================================================
// 7. MAIN APPLICATION ENTRYPOINT
// ==============================================================================

void app_main(void) {
    // 1. Immediately clamp all motor driver pins to LOW with pull-downs enabled.
    // This prevents ANY motor twitch / 2-3s spin during bootloader, NVS, and camera init.
    early_clamp_motor_pins();

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    s_camera_mutex = xSemaphoreCreateMutex();

    // Initialize OLED Screen immediately so user gets instant visual feedback
    oled_init();
    oled_start_animation_task();
    oled_draw_eyes(1, 0); // Show friendly neutral eyes on boot

    // Initialize motors immediately so PWM channels hold 0 duty BEFORE camera init starts
    init_motors();

    // Initialize LiveKit SDK
    livekit_system_init();

    init_camera();
    init_speaker_audio();
    init_wifi();

    bool need_prov = false;
    if (strlen(s_wifi_ssid) == 0) {
        ESP_LOGW(TAG, "No Wi-Fi credentials configured. Launching setup hotspot immediately.");
        need_prov = true;
    } else {
        ESP_LOGI(TAG, "Attempting connection to saved Wi-Fi [%s] (timeout: 12s)...", s_wifi_ssid);
        EventBits_t conn_bits = xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, false, true, pdMS_TO_TICKS(12000));
        if ((conn_bits & WIFI_CONNECTED_BIT) == 0) {
            ESP_LOGW(TAG, "❌ Could not connect to saved Wi-Fi [%s] within 12s", s_wifi_ssid);
            need_prov = true;
        }
    }

    if (need_prov) {
        ESP_LOGW(TAG, "================================================");
        ESP_LOGW(TAG, "📡 LAUNCHING LUMI WI-FI SETUP HOTSPOT: [LUMI-Setup]");
        ESP_LOGW(TAG, "👉 1. Connect phone Wi-Fi to 'LUMI-Setup'");
        ESP_LOGW(TAG, "👉 2. Open browser: http://192.168.4.1");
        ESP_LOGW(TAG, "================================================");

        oled_show_wifi_setup_screen("LUMI-Setup");
        start_wifi_prov_portal();

        // Wait until user connects phone and submits hotspot credentials on captive portal
        xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, false, true, portMAX_DELAY);
        ESP_LOGI(TAG, "🎉 Wi-Fi successfully provisioned and connected!");
        stop_wifi_prov_portal();
    }

    // Start local camera stream server immediately so user can view live video anytime
    start_camera_server();
    ESP_LOGI(TAG, "================================================");
    ESP_LOGI(TAG, "🎥 Camera Live Stream: http://%s:81/stream", s_robot_ip);
    ESP_LOGI(TAG, "📸 Camera Snapshot:    http://%s:81/capture", s_robot_ip);
    ESP_LOGI(TAG, "================================================");

    // 1. Supabase Pairing Handshake
    char req_body[256];
    snprintf(req_body, sizeof(req_body), 
             "{\"lumi_id\":\"%s\",\"device_secret\":\"%s\"}", 
             LUMI_ID, DEVICE_SECRET);

    char reg_url[128];
    snprintf(reg_url, sizeof(reg_url), "%s/functions/v1/register-robot", SUPABASE_BASE_URL);

    bool paired = false;
    while (!paired) {
        char *res = http_post_json(reg_url, req_body);
        if (res) {
            cJSON *root = cJSON_Parse(res);
            if (root) {
                cJSON *status = cJSON_GetObjectItem(root, "status");
                cJSON *code = cJSON_GetObjectItem(root, "pairing_code");

                if (code && code->valuestring) {
                    ESP_LOGW(TAG, "================================================");
                    ESP_LOGW(TAG, "🎉 LUMI PAIRING CODE: [%s]", code->valuestring);
                    ESP_LOGW(TAG, "👉 Enter this 6-digit code in the LUMI Mobile App!");
                    ESP_LOGW(TAG, "================================================");
                    oled_show_pairing_screen(code->valuestring);
                } else if (status && strcmp(status->valuestring, "paired") == 0) {
                    ESP_LOGI(TAG, "🎉 Robot paired to account! Fetching LiveKit token...");
                    paired = true;
                    oled_set_paired(true);
                }
                cJSON_Delete(root);
            }
            free(res);
        }
        if (!paired) {
            vTaskDelay(pdMS_TO_TICKS(3000));
        }
    }

    // 2. Fetch LiveKit Room Token
    char tok_url[128];
    snprintf(tok_url, sizeof(tok_url), "%s/functions/v1/robot-token", SUPABASE_BASE_URL);
    char *res = http_post_json(tok_url, req_body);
    
    if (res) {
        cJSON *root = cJSON_Parse(res);
        if (root) {
            cJSON *token_item = cJSON_GetObjectItem(root, "token");
            cJSON *url_item = cJSON_GetObjectItem(root, "url");
            if (token_item && url_item && token_item->valuestring && url_item->valuestring) {
                strncpy(s_livekit_token, token_item->valuestring, sizeof(s_livekit_token) - 1);
                strncpy(s_livekit_url, url_item->valuestring, sizeof(s_livekit_url) - 1);
            }
            cJSON_Delete(root);
        }
        free(res);
    }

    if (strlen(s_livekit_token) == 0) {
        ESP_LOGE(TAG, "Failed to get LiveKit token");
        return;
    }

    ESP_LOGI(TAG, "Connecting to LiveKit Room at %s...", s_livekit_url);

    // 3. Connect LiveKit Room & WebRTC Data Channel
    s_room_handle = NULL;
    livekit_room_options_t room_options = {
        .publish = {
            .kind = LIVEKIT_MEDIA_TYPE_NONE,
        },
        .subscribe = {
            .kind = LIVEKIT_MEDIA_TYPE_NONE,
        },
        .on_data_received = on_data_received,
        .on_state_changed = on_room_state_changed,
    };

    livekit_err_t lk_err = livekit_room_create(&s_room_handle, &room_options);
    if (lk_err == LIVEKIT_ERR_NONE) {
        livekit_room_connect(s_room_handle, s_livekit_url, s_livekit_token);
        ESP_LOGI(TAG, "Robot live! Connected to LiveKit Cloud WebRTC room!");
        // Launch worldwide camera streaming task on Core 1
        xTaskCreatePinnedToCore(video_stream_task, "lk_vid_task", 8192, NULL, 5, NULL, 1);
    } else {
        ESP_LOGE(TAG, "Failed to create LiveKit room object, error: %d", lk_err);
    }

    // Heartbeat loop
    char hb_url[128];
    snprintf(hb_url, sizeof(hb_url), "%s/functions/v1/robot-heartbeat", SUPABASE_BASE_URL);
    char hb_body[320];
    snprintf(hb_body, sizeof(hb_body), 
             "{\"lumi_id\":\"%s\",\"device_secret\":\"%s\",\"battery_percent\":90,\"wifi_signal\":4,\"local_ip\":\"%s\"}", 
             LUMI_ID, DEVICE_SECRET, s_robot_ip);

    int hb_ticks = 0;
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
        hb_ticks++;

        // Cute Idle Personality: When Lumi has been quiet/idle for >20 seconds,
        // play soft curious "hmmm..." sound and transition eyes to thinking mood
        uint32_t now_ms = (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
        if (s_room_connected && !s_motors_active && s_active_gesture == GESTURE_NONE && !s_is_user_speaking) {
            if (now_ms - s_last_interaction_ms >= 20000 && !s_is_in_thinking_mode) {
                s_is_in_thinking_mode = true;
                ESP_LOGI(TAG, "🤔 Lumi idle: playing cute 'hmmm...' sound and thinking animation");
                oled_set_emotion_by_name("thinking");
                play_cute_hmmm_sound();
                s_last_interaction_ms = now_ms - 5000; // Will contemplate again after 25s if still idle
            }
        }

        // Fast auto-reconnect if LiveKit room connection was lost or dropped (checks every 2 seconds)
        if (!s_room_connected && s_room_handle != NULL && strlen(s_livekit_token) > 0 && (hb_ticks % 2 == 0)) {
            ESP_LOGW(TAG, "LiveKit room disconnected. Attempting fast auto-reconnect...");
            livekit_err_t rec_err = livekit_room_connect(s_room_handle, s_livekit_url, s_livekit_token);
            if (rec_err != LIVEKIT_ERR_NONE) {
                ESP_LOGE(TAG, "LiveKit reconnect failed: %d. Refreshing token...", rec_err);
                char *new_res = http_post_json(tok_url, req_body);
                if (new_res) {
                    cJSON *tok_root = cJSON_Parse(new_res);
                    if (tok_root) {
                        cJSON *t_item = cJSON_GetObjectItem(tok_root, "token");
                        cJSON *u_item = cJSON_GetObjectItem(tok_root, "url");
                        if (t_item && u_item && t_item->valuestring && u_item->valuestring) {
                            strncpy(s_livekit_token, t_item->valuestring, sizeof(s_livekit_token) - 1);
                            strncpy(s_livekit_url, u_item->valuestring, sizeof(s_livekit_url) - 1);
                            livekit_room_connect(s_room_handle, s_livekit_url, s_livekit_token);
                        }
                        cJSON_Delete(tok_root);
                    }
                    free(new_res);
                }
            }
        }

        // Send Supabase heartbeat every 30 seconds
        if (hb_ticks >= 30) {
            hb_ticks = 0;
            char *hb_res = http_post_json(hb_url, hb_body);
            if (hb_res) free(hb_res);
        }

        // Also publish real-time telemetry over WebRTC Data Channel if connected
        if (s_room_connected && s_room_handle != NULL) {
            char telem_json[256];
            snprintf(telem_json, sizeof(telem_json),
                     "{\"t\":\"telemetry\",\"batteryPercent\":90,\"wifiSignal\":4,\"latencyMs\":40,\"currentEmotion\":\"happy\",\"ip\":\"%s\"}",
                     s_robot_ip);
            livekit_data_payload_t payload = {
                .bytes = (uint8_t*)telem_json,
                .size = strlen(telem_json)
            };
            livekit_data_publish_options_t pub_opts = {
                .payload = &payload,
                .topic = "telemetry",
                .lossy = true
            };
            livekit_room_publish_data(s_room_handle, &pub_opts);
        }
    }
}
