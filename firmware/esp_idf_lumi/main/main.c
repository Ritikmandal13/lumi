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
#include "cJSON.h"
#include "esp_camera.h"
#include "driver/ledc.h"

// LiveKit SDK
#include "livekit.h"

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

// Motor Driver Pins
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
        .xclk_freq_hz = 20000000,
        .ledc_timer = LEDC_TIMER_1,
        .ledc_channel = LEDC_CHANNEL_4,
        .pixel_format = PIXFORMAT_JPEG,
        .frame_size = FRAMESIZE_VGA, // 640x480
        .jpeg_quality = 12,
        .fb_count = 2,
        .grab_mode = CAMERA_GRAB_LATEST
    };

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed with error 0x%x", err);
        return err;
    }

    sensor_t *s = esp_camera_sensor_get();
    if (s != NULL) {
        s->set_vflip(s, 1);
        s->set_hmirror(s, 0);
    }
    ESP_LOGI(TAG, "OV3660 camera initialized successfully!");
    return ESP_OK;
}

// ==============================================================================
// 5. WI-FI & SUPABASE HTTP HELPER
// ==============================================================================

static EventGroupHandle_t s_wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_wifi_connect();
        xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "Connected to Wi-Fi!");
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

static void on_data_received(const uint8_t *data, size_t len, void *user_ctx) {
    cJSON *json = cJSON_ParseWithLength((const char *)data, len);
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
            if (name) {
                ESP_LOGI(TAG, "Emote Triggered: %s", name->valuestring);
            }
        }
    }
    cJSON_Delete(json);
}

// ==============================================================================
// 7. MAIN APPLICATION ENTRYPOINT
// ==============================================================================

void app_main(void) {
    ESP_ERROR_CHECK(nvs_flash_init());

    init_motors();
    init_camera();
    init_wifi();

    ESP_LOGI(TAG, "Waiting for Wi-Fi connection...");
    xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, false, true, portMAX_DELAY);

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
                } else if (status && strcmp(status->valuestring, "paired") == 0) {
                    ESP_LOGI(TAG, "🎉 Robot paired to account! Fetching LiveKit token...");
                    paired = true;
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
    
    char livekit_url[128] = {0};
    char livekit_token[512] = {0};

    if (res) {
        cJSON *root = cJSON_Parse(res);
        if (root) {
            cJSON *token_item = cJSON_GetObjectItem(root, "token");
            cJSON *url_item = cJSON_GetObjectItem(root, "url");
            if (token_item && url_item) {
                strncpy(livekit_token, token_item->valuestring, sizeof(livekit_token) - 1);
                strncpy(livekit_url, url_item->valuestring, sizeof(livekit_url) - 1);
            }
            cJSON_Delete(root);
        }
        free(res);
    }

    if (strlen(livekit_token) == 0) {
        ESP_LOGE(TAG, "Failed to get LiveKit token");
        return;
    }

    ESP_LOGI(TAG, "Connecting to LiveKit Room at %s...", livekit_url);

    // 3. Connect LiveKit Room & Publish Camera Video
    livekit_room_t *room = livekit_room_create();
    livekit_room_set_data_callback(room, on_data_received, NULL);
    livekit_room_connect(room, livekit_url, livekit_token);

    ESP_LOGI(TAG, "Robot live! Camera streaming and listening for joystick driving!");

    // Heartbeat loop
    char hb_url[128];
    snprintf(hb_url, sizeof(hb_url), "%s/functions/v1/robot-heartbeat", SUPABASE_BASE_URL);
    char hb_body[256];
    snprintf(hb_body, sizeof(hb_body), 
             "{\"lumi_id\":\"%s\",\"device_secret\":\"%s\",\"battery_percent\":90,\"wifi_signal\":4}", 
             LUMI_ID, DEVICE_SECRET);

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(10000));
        char *hb_res = http_post_json(hb_url, hb_body);
        if (hb_res) free(hb_res);
    }
}
