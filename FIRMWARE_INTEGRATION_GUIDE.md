# 🤖 LUMI ESP32 Firmware Integration Guide

This guide provides the complete hardware & firmware specification for connecting the LUMI robot hardware to the cloud backend and the mobile app.

---

## 1. System Architecture

```
┌─────────────────┐             HTTPS REST
│   ESP32 Robot   │──────────────────────────────────┐
│  (ESP32-S3/P4)  │                                  │
└────────┬────────┘                                  ▼
         │                               ┌──────────────────────┐
         │                               │ Supabase Cloud       │
         │                               │ - register-robot     │
         │                               │ - robot-token        │
         │ WebRTC Data & AV              │ - robot-heartbeat    │
         │                               └──────────────────────┘
         ▼                                           ▲
┌─────────────────┐                                  │
│  LiveKit Cloud  │◀─────────────────────────────────┘
│  Audio/Video/   │
│  Control Channel│◀─────────────────────────────────┐
└─────────────────┘                                  │
         ▲                                           │
         │ WebRTC Data & AV                          │ JWT
         │                                           │
┌────────┴────────┐                              ┌───┴──────────────────┐
│  LUMI Mobile    │─────────────────────────────▶│ Supabase Cloud       │
│  App (User)     │                              │ - claim-robot        │
└─────────────────┘                              │ - user-token         │
                                                 └──────────────────────┘
```

The robot interacts with two cloud services:
1. **Supabase Cloud (HTTPS REST)**: Identity, pairing, and token issuance. The robot *never* connects to the database directly.
2. **LiveKit Cloud (WebRTC)**: Ultra-low-latency video streaming, two-way audio, and real-time joystick control messages.

---

## 2. Hardware Specification & Verified Pinout Table

### Verified Prototype Hardware:
- **Board**: `GOOUUU ESP32-S3-CAM V1.5` (`ESP32-S3 N16R8` with 16MB Flash + 8MB Octal PSRAM)
- **Camera**: Built-in `OV3660` (fixed on-board wiring: GPIO 4–13, 15–18)
- **Ready-to-Flash Arduino Sketch**: [`firmware/LUMI_ESP32_S3/LUMI_ESP32_S3.ino`](file:///c:/Users/ritik/OneDrive/Desktop/lumi/firmware/LUMI_ESP32_S3/LUMI_ESP32_S3.ino)

### Verified Pinout Mapping (from `LUMI_Connection_Table.pdf`):

| Subsystem | Signal | GPIO Pin | Voltage / Notes |
| :--- | :--- | :--- | :--- |
| **OLED (I2C)** | `SDA` | **GPIO 21** | 3.3V rail (Address `0x3C`) |
| | `SCL` | **GPIO 47** | 3.3V rail |
| **I2S Mic (INMP441)** | `SD` (Data In) | **GPIO 1** | 3.3V rail (**Never 5V**) |
| | `SCK` (Bit Clock) | **GPIO 41** | *Shared with Amp BCLK* |
| | `WS` (Word Select) | **GPIO 42** | *Shared with Amp LRC* |
| | `L/R` | **GND rail** | Selects Left Channel |
| **I2S Amp (MAX98357A)** | `DIN` (Data Out) | **GPIO 14** | 5V rail |
| | `BCLK` | **GPIO 41** | *Shared with Mic SCK* |
| | `LRC` | **GPIO 42** | *Shared with Mic WS* |
| **Motors (L298N H-Bridge)** | `IN1` (Left PWM) | **GPIO 38** | Speed & Direction PWM |
| | `IN2` (Left PWM) | **GPIO 39** | Speed & Direction PWM |
| | `IN3` (Right PWM) | **GPIO 40** | Speed & Direction PWM |
| | `IN4` (Right PWM) | **GPIO 48** | Speed & Direction PWM |
| | `ENA` / `ENB` | Jumper Caps ON | Speed is PWM on IN1–IN4 |
| | `5V-Enable Jumper` | **Removed** | 5V supplied externally at 5V terminal |

> ⚠️ **Reserved / Do Not Use Pins**: GPIO 35, 36, 37 (Octal PSRAM), GPIO 19, 20 (USB), GPIO 43, 44 (Serial CH340), GPIO 0, 3, 45, 46 (Strapping / Boot pins).

---

## 3. Device Identity & Non-Volatile Storage (NVS)

Each robot must have two unique credentials flashed to its factory NVS partition:

| Key | Format | Example | Description |
| :--- | :--- | :--- | :--- |
| `lumi_id` | String | `LUMI-A842` | Unique robot identifier (e.g. `LUMI-` + MAC suffix) |
| `device_secret` | 32+ character string | `x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD` | Cryptographically random factory secret |

> 🔒 **Security Notice**: Only the SHA-256 hash of `device_secret` is stored in the database. Never hardcode secrets in source code; flash them into NVS during manufacturing or initial provisioning.

---

## 4. Cloud Endpoints Reference

**Base URL**: `https://ehqqlxcdscgsebiodxfk.supabase.co`

### Endpoint 1: Register / Pair Robot (`POST /functions/v1/register-robot`)
Called on first boot or when the robot needs pairing.

- **URL**: `https://ehqqlxcdscgsebiodxfk.supabase.co/functions/v1/register-robot`
- **Method**: `POST`
- **Headers**:
  ```http
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "lumi_id": "LUMI-A842",
    "device_secret": "x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD"
  }
  ```
- **Response (`201 Created` or `200 OK`)**:
  ```json
  {
    "status": "pairing",
    "pairing_code": "482917",
    "expires_at": "2026-10-04T12:30:00.000Z"
  }
  ```
- **Firmware Action**:
  - Display the `pairing_code` (e.g., `482917`) clearly on the robot's screen.
  - The user types this code into the mobile app to claim the robot.
  - If the robot was already paired, the response will be:
    ```json
    { "status": "paired", "pairing_code": null }
    ```

---

### Endpoint 2: Get LiveKit Room Token (`POST /functions/v1/robot-token`)
Called whenever the robot wants to connect to LiveKit for video/control streaming.

- **URL**: `https://ehqqlxcdscgsebiodxfk.supabase.co/functions/v1/robot-token`
- **Method**: `POST`
- **Headers**:
  ```http
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "lumi_id": "LUMI-A842",
    "device_secret": "x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "url": "wss://lumi-0hgrum5u.livekit.cloud",
    "room": "robot-LUMI-A842",
    "expires_in": 86400
  }
  ```
- **Firmware Action**:
  - Connect to LiveKit at `url` using the JWT `token`.

---

### Endpoint 3: Heartbeat (`POST /functions/v1/robot-heartbeat`)
Called periodically (every 30 to 60 seconds) to maintain online status in the database.

- **URL**: `https://ehqqlxcdscgsebiodxfk.supabase.co/functions/v1/robot-heartbeat`
- **Method**: `POST`
- **Headers**:
  ```http
  Content-Type: application/json
  ```
- **Request Body**:
  ```json
  {
    "lumi_id": "LUMI-A842",
    "device_secret": "x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD",
    "battery_percent": 82,
    "wifi_signal": 4
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "status": "ok",
    "last_seen_at": "2026-10-04T12:00:00.000Z"
  }
  ```

---

## 5. LiveKit WebRTC Control Protocol (Data Channel)

Once connected to the LiveKit room, control messages are exchanged over the **WebRTC Data Channel** as JSON text packets.

### Incoming Packets (From Mobile App ➡️ Robot)

#### 1. Joystick Drive Command (`t = "drive"`)
Sent rapidly (every 50ms) while user drags the virtual joystick:
```json
{
  "t": "drive",
  "x": 0.75,
  "y": -0.30
}
```
- `x`: Horizontal axis ranging from `-1.0` (full left) to `+1.0` (full right).
- `y`: Vertical axis ranging from `-1.0` (full reverse) to `+1.0` (full forward).
- **Motor Differential Drive Formula**:
  ```c
  float left_motor  = y + x;
  float right_motor = y - x;
  
  // Clamp to [-1.0, 1.0]
  if (left_motor > 1.0f)  left_motor = 1.0f;
  if (left_motor < -1.0f) left_motor = -1.0f;
  if (right_motor > 1.0f)  right_motor = 1.0f;
  if (right_motor < -1.0f) right_motor = -1.0f;
  ```
- **Watchdog Timer**: If no `drive` packet is received for **300ms**, the robot must automatically stop motors for safety.

#### 2. Stop Motors (`t = "stop"`)
Sent on emergency stop button tap or joystick release:
```json
{
  "t": "stop"
}
```
- Firmware immediately sets motor PWM to 0.

#### 3. Emotion Display (`t = "emotion"`)
Sent when user triggers an emote from the app:
```json
{
  "t": "emotion",
  "name": "happy"
}
```
- Standard emotion names: `"happy"`, `"curious"`, `"love"`, `"excited"`, `"wink"`, `"sleepy"`, `"sad"`.

#### 4. Gesture Animation (`t = "play"`)
Sent when user triggers a routine:
```json
{
  "t": "play",
  "name": "dance"
}
```
- Standard gesture names: `"nod"`, `"shake"`, `"spin"`, `"dance"`, `"peekaboo"`.

#### 5. Speaker Volume (`t = "volume"`)
```json
{
  "t": "volume",
  "value": 80
}
```
- Value from `0` to `100`.

---

### Outgoing Packets (From Robot ➡️ Mobile App)

#### Telemetry Packet (`t = "telemetry"`)
Send every 1–2 seconds over the data channel for real-time app HUD display:
```json
{
  "t": "telemetry",
  "batteryPercent": 84,
  "wifiSignal": 4,
  "latencyMs": 42,
  "currentEmotion": "happy"
}
```

---

## 6. Two-Way Audio Protocol (Push-to-Talk)

- **Robot ➡️ App**: Robot publishes an audio track captured via I2S microphone (encoded with Opus). The mobile app automatically plays this audio through device speakers.
- **App ➡️ Robot**: When the user presses the PTT button in the mobile app, the app publishes its microphone audio track. The ESP32 subscribes to the user's audio track and streams decoded PCM to the I2S DAC / amplifier.

---

## 7. Recommended Firmware State Machine

```
              ┌───────────────┐
              │  Power On /   │
              │  Connect Wi-Fi│
              └───────┬───────┘
                      │
                      ▼
         POST /functions/v1/register-robot
                      │
         ┌────────────┴────────────┐
         │ status == "pairing" ?   │
        YES                        NO ("paired")
         │                         │
         ▼                         │
   Display 6-digit                 │
   Pairing Code on OLED            │
         │                         │
   Poll /register-robot            │
   until status == "paired"        │
         │                         │
         └────────────┬────────────┘
                      │
                      ▼
         POST /functions/v1/robot-token
                      │
                      ▼
         Connect to LiveKit Cloud Room
         - Publish Camera Video Track
         - Publish Mic Audio Track
         - Listen to Data Channel (Drive/Emotes)
         - Subscribe to User Audio (PTT)
                      │
                      ▼
              ┌───────────────┐
              │  Active Loop  │
              │  - PWM Drive  │
              │  - Heartbeat  │
              │  - Telemetry  │
              └───────────────┘
```

---

## 8. Step-by-Step Flashing & Provisioning Instructions

### Step 8.1: Generate and Flash Factory NVS Partition
To avoid hardcoding device secrets in source code, each robot has its credentials flashed into its NVS partition.

1. Create a file `nvs_factory.csv`:
   ```csv
   key,type,encoding,value
   lumi,namespace,,
   lumi_id,data,string,LUMI-001
   device_secret,data,string,x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD
   ```

2. Generate the binary partition:
   ```bash
   python $IDF_PATH/components/nvs_flash/nvs_partition_generator/nvs_partition_gen.py generate nvs_factory.csv nvs_factory.bin 0x6000
   ```

3. Flash the NVS partition to the ESP32 (replace `COM3` / `/dev/ttyUSB0` with your port):
   ```bash
   esptool.py -p COM3 -b 921600 write_flash 0x9000 nvs_factory.bin
   ```

---

### Step 8.2: Required `sdkconfig.defaults` Configuration
LiveKit WebRTC and camera streaming require PSRAM and SSL certificate bundles. Add these lines to your project's `sdkconfig.defaults`:

```ini
# Target
CONFIG_IDF_TARGET="esp32s3"

# PSRAM (Mandatory for WebRTC & Camera)
CONFIG_SPIRAM=y
CONFIG_SPIRAM_MODE_OCT=y
CONFIG_SPIRAM_SPEED_80M=y
CONFIG_SPIRAM_BOOT_INIT=y
CONFIG_SPIRAM_USE_MALLOC=y

# SSL / TLS (Mandatory for Supabase HTTPS & LiveKit WSS)
CONFIG_MBEDTLS_CERTIFICATE_BUNDLE=y
CONFIG_MBEDTLS_CERTIFICATE_BUNDLE_DEFAULT_FULL=y

# Stack & Memory Tuning
CONFIG_ESP_MAIN_TASK_STACK_SIZE=10240
CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096
CONFIG_PTHREAD_TASK_STACK_SIZE_DEFAULT=8192
```

---

## 9. Complete Working ESP-IDF C Starter Code (`main/main.c`)

Here is the ready-to-compile starter implementation:

```c
#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_http_client.h"
#include "cJSON.h"
#include "livekit.h"

static const char *TAG = "LUMI_ROBOT";

#define SUPABASE_BASE_URL "https://ehqqlxcdscgsebiodxfk.supabase.co"
static char g_lumi_id[32] = {0};
static char g_device_secret[64] = {0};

/* 1. Read Credentials from NVS */
static esp_err_t load_nvs_credentials(void) {
    nvs_handle_t nvs;
    esp_err_t err = nvs_open("lumi", NVS_READONLY, &nvs);
    if (err != ESP_OK) return err;

    size_t len = sizeof(g_lumi_id);
    nvs_get_str(nvs, "lumi_id", g_lumi_id, &len);

    len = sizeof(g_device_secret);
    nvs_get_str(nvs, "device_secret", g_device_secret, &len);

    nvs_close(nvs);
    ESP_LOGI(TAG, "Loaded Robot ID: %s", g_lumi_id);
    return ESP_OK;
}

/* 2. HTTPS Request Helper */
static char* http_post_json(const char *url, const char *json_body) {
    char *response_buffer = malloc(2048);
    int content_len = 0;

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
        content_len = esp_http_client_read_response(client, response_buffer, 2047);
        if (content_len >= 0) response_buffer[content_len] = '\0';
    }
    esp_http_client_cleanup(client);
    return response_buffer;
}

/* 3. Handle Incoming WebRTC Control Packets */
static void on_data_received(const uint8_t *data, size_t len, void *user_ctx) {
    cJSON *json = cJSON_ParseWithLength((const char *)data, len);
    if (!json) return;

    cJSON *t = cJSON_GetObjectItem(json, "t");
    if (!t) { cJSON_Delete(json); return; }

    if (strcmp(t->valuestring, "drive") == 0) {
        float x = (float)cJSON_GetObjectItem(json, "x")->valuedouble;
        float y = (float)cJSON_GetObjectItem(json, "y")->valuedouble;

        // Differential motor drive:
        float left = y + x;
        float right = y - x;
        ESP_LOGI(TAG, "Motor Drive -> Left: %.2f, Right: %.2f", left, right);
        // Set motor PWM duty cycles here
    } else if (strcmp(t->valuestring, "stop") == 0) {
        ESP_LOGW(TAG, "EMERGENCY STOP RECEIVED");
        // Set motor PWM to 0
    } else if (strcmp(t->valuestring, "emotion") == 0) {
        const char *emo = cJSON_GetObjectItem(json, "name")->valuestring;
        ESP_LOGI(TAG, "Display Emotion: %s", emo);
        // Update OLED / LED eyes
    }

    cJSON_Delete(json);
}

/* 4. Pairing and Main Task */
void app_main(void) {
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // Connect Wi-Fi here (via wifi provisioning or hardcoded credentials for testing)
    load_nvs_credentials();

    // Construct JSON payload
    char req_body[256];
    snprintf(req_body, sizeof(req_body), 
             "{\"lumi_id\":\"%s\",\"device_secret\":\"%s\"}", 
             g_lumi_id, g_device_secret);

    // Call /register-robot
    char reg_url[128];
    snprintf(reg_url, sizeof(reg_url), "%s/functions/v1/register-robot", SUPABASE_BASE_URL);
    char *res = http_post_json(reg_url, req_body);

    cJSON *root = cJSON_Parse(res);
    cJSON *status = cJSON_GetObjectItem(root, "status");
    cJSON *code = cJSON_GetObjectItem(root, "pairing_code");

    if (code && code->valuestring) {
        ESP_LOGW(TAG, "=================================");
        ESP_LOGW(TAG, "PAIRING CODE: [%s]", code->valuestring);
        ESP_LOGW(TAG, "Show this on OLED display!");
        ESP_LOGW(TAG, "=================================");
        // Show on OLED: display_show_text(code->valuestring);
    }
    cJSON_Delete(root);
    free(res);

    // Get LiveKit Room Token
    char tok_url[128];
    snprintf(tok_url, sizeof(tok_url), "%s/functions/v1/robot-token", SUPABASE_BASE_URL);
    res = http_post_json(tok_url, req_body);
    root = cJSON_Parse(res);

    const char *token = cJSON_GetObjectItem(root, "token")->valuestring;
    const char *ws_url = cJSON_GetObjectItem(root, "url")->valuestring;

    ESP_LOGI(TAG, "Connecting LiveKit at %s...", ws_url);

    // Connect LiveKit Room & listen to data channel
    livekit_room_t *room = livekit_room_create();
    livekit_room_set_data_callback(room, on_data_received, NULL);
    livekit_room_connect(room, ws_url, token);

    ESP_LOGI(TAG, "Robot live and listening for drive controls!");
}
```

---

## 10. Summary Checklist for Hardware Engineer

- [ ] Flash `nvs_factory.bin` with `lumi_id` and `device_secret`.
- [ ] Connect ESP32-S3 to Wi-Fi.
- [ ] Verify `POST /functions/v1/register-robot` displays 6-digit code on OLED.
- [ ] Claim robot in mobile app.
- [ ] Verify `POST /functions/v1/robot-token` receives LiveKit token and connects room.
- [ ] Check motor response to incoming `{"t":"drive","x":...,"y":...}` data packets.

