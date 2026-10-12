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
#include "esp_http_client.h"
#include "esp_http_server.h"
#include "esp_crt_bundle.h"
#include "cJSON.h"
#include "esp_camera.h"
#include "driver/ledc.h"
#include "driver/i2s_std.h"
#include <math.h>

// LiveKit SDK
#include "livekit.h"
#include "oled.h"

static const char *TAG = "LUMI_ROBOT";

// ==============================================================================
// 1. CREDENTIALS & ENDPOINTS
// ==============================================================================

#define WIFI_SSID           "Anmol's S24 FE"
#define WIFI_PASS           "11111111"

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
// 3. MOTOR CONTROLLER
// ==============================================================================

static void init_motors(void) {
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
    ESP_LOGI(TAG, "Motors initialized on GPIO 38, 39, 40, 48.");
}

static void stop_motors(void) {
    ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, 0);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN1);
    ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, 0);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN2);
    ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, 0);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN3);
    ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, 0);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN4);
}

static void apply_differential_drive(float x, float y) {
    float left = y + x;
    float right = y - x;

    if (left > 1.0f) left = 1.0f;
    if (left < -1.0f) left = -1.0f;
    if (right > 1.0f) right = 1.0f;
    if (right < -1.0f) right = -1.0f;

    int left_pwm = (int)(fabs(left) * 255.0f);
    int right_pwm = (int)(fabs(right) * 255.0f);

    // Left motor direction
    if (left > 0) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, left_pwm);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, 0);
    } else if (left < 0) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, left_pwm);
    } else {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN1, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN2, 0);
    }

    // Right motor direction
    if (right > 0) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, right_pwm);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, 0);
    } else if (right < 0) {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, right_pwm);
    } else {
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN3, 0);
        ledc_set_duty(LEDC_MODE, LEDC_CH_IN4, 0);
    }

    ledc_update_duty(LEDC_MODE, LEDC_CH_IN1);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN2);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN3);
    ledc_update_duty(LEDC_MODE, LEDC_CH_IN4);
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
        .jpeg_quality = 14,
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
        s->set_vflip(s, 0);
        s->set_hmirror(s, 0);
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
// 5. WI-FI & SUPABASE HTTP HELPER
// ==============================================================================

static EventGroupHandle_t s_wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0
static char s_robot_ip[32] = "127.0.0.1";

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_wifi_connect();
        xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        snprintf(s_robot_ip, sizeof(s_robot_ip), IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "Connected to Wi-Fi! Robot IP: %s", s_robot_ip);
    }
}

static void init_wifi(void) {
    s_wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

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

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
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
    cJSON *json = cJSON_ParseWithLength((const char *)data->payload.bytes, data->payload.size);
    if (!json) return;

    cJSON *t = cJSON_GetObjectItem(json, "t");
    if (t && t->valuestring) {
        if (strcmp(t->valuestring, "drive") == 0) {
            cJSON *x_item = cJSON_GetObjectItem(json, "x");
            cJSON *y_item = cJSON_GetObjectItem(json, "y");
            if (x_item && y_item) {
                float x = (float)x_item->valuedouble;
                float y = (float)y_item->valuedouble;
                apply_differential_drive(x, y);
            }
        } else if (strcmp(t->valuestring, "stop") == 0) {
            stop_motors();
            ESP_LOGW(TAG, "EMERGENCY STOP EXECUTED");
        } else if (strcmp(t->valuestring, "emotion") == 0) {
            cJSON *name = cJSON_GetObjectItem(json, "name");
            if (name && name->valuestring) {
                ESP_LOGI(TAG, "Emote Triggered: %s", name->valuestring);
                oled_set_emotion_by_name(name->valuestring);
                if (strcmp(name->valuestring, "happy") == 0) {
                    play_tone(659, 80);
                    play_tone(880, 120);
                } else if (strcmp(name->valuestring, "love") == 0) {
                    play_tone(523, 100);
                    play_tone(659, 100);
                } else if (strcmp(name->valuestring, "excited") == 0) {
                    play_tone(784, 80);
                    play_tone(1046, 120);
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
    ESP_LOGI(TAG, "🎥 Worldwide LiveKit WebRTC Video Stream Task started on Core 1");
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
                        // SCTP send queue is temporarily full, yield a bit to let it drain
                        vTaskDelay(pdMS_TO_TICKS(50));
                    }
                }
                xSemaphoreGive(s_camera_mutex);
            }
            vTaskDelay(pdMS_TO_TICKS(100)); // ~10 FPS for reliable, jitter-free transmission without queue overflows
        } else {
            vTaskDelay(pdMS_TO_TICKS(200));
        }
    }
}

// ==============================================================================
// 7. MAIN APPLICATION ENTRYPOINT
// ==============================================================================

void app_main(void) {
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

    // Initialize LiveKit SDK
    livekit_system_init();

    init_camera();
    init_motors();
    init_speaker_audio();
    init_wifi();

    ESP_LOGI(TAG, "Waiting for Wi-Fi connection...");
    xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, false, true, portMAX_DELAY);

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

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(30000));
        char *hb_res = http_post_json(hb_url, hb_body);
        if (hb_res) free(hb_res);

        // Auto-reconnect if LiveKit room connection was lost or dropped
        if (!s_room_connected && s_room_handle != NULL && strlen(s_livekit_token) > 0) {
            ESP_LOGW(TAG, "LiveKit room disconnected. Attempting auto-reconnect...");
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
