/**
 * ==============================================================================
 * 🤖 LUMI ROBOT — ESP32-S3 Complete Production Firmware
 * ==============================================================================
 * Target Board : GOOUUU ESP32-S3-CAM V1.5 (ESP32-S3 N16R8, 16MB Flash, 8MB Octal PSRAM)
 * Camera Sensor: OV3660 (built-in, GPIO 4-13, 15-18)
 * Display      : 128x64 OLED (SSD1306/SH1106 on I2C SDA=GPIO 21, SCL=GPIO 47)
 * Motor Driver : L298N Dual H-Bridge (IN1=38, IN2=39, IN3=40, IN4=48)
 * I2S Audio    : Mic INMP441 (SD=1, SCK=41, WS=42) | Amp MAX98357A (DIN=14, BCLK=41, LRC=42)
 * Cloud Backend: Supabase REST (Cloud Pairing & Telemetry)
 * Local Stream : HTTP MJPEG Camera Server (Port 81) & Direct Drive API (Port 80)
 * ==============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_camera.h"
#include "esp_http_server.h"

// ==============================================================================
// 1. CONFIGURATION & CREDENTIALS
// ==============================================================================

// Client's Wi-Fi hotspot credentials
const char* WIFI_SSID     = "Anmol's S24 FE";
const char* WIFI_PASSWORD = "11111111";

// Supabase Cloud Configuration
const char* SUPABASE_BASE_URL = "https://ehqqlxcdscgsebiodxfk.supabase.co";
const char* LUMI_ID           = "LUMI-001";
const char* DEVICE_SECRET     = "x8K2mP9vL4qR7tW1zY5bN3cF6hJ0sD"; // Unique 32-character secret

// ==============================================================================
// 2. PIN DEFINITIONS (From LUMI_Connection_Table.pdf)
// ==============================================================================

// OLED Display (I2C)
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    47
#define OLED_WIDTH      128
#define OLED_HEIGHT     64
#define OLED_ADDR       0x3C

// Motor Driver (L298N H-Bridge)
#define MOTOR_LEFT_IN1  38
#define MOTOR_LEFT_IN2  39
#define MOTOR_RIGHT_IN3 40
#define MOTOR_RIGHT_IN4 48

// PWM Channels for Motor Speed Control
#define PWM_FREQ        1000
#define PWM_RES         8   // 0 - 255

// GOOUUU ESP32-S3-CAM Built-In OV3660 Camera Pins
#define PWDN_GPIO_NUM   -1
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM   15
#define SIOD_GPIO_NUM   4
#define SIOC_GPIO_NUM   5
#define Y9_GPIO_NUM     16
#define Y8_GPIO_NUM     17
#define Y7_GPIO_NUM     18
#define Y6_GPIO_NUM     12
#define Y5_GPIO_NUM     10
#define Y4_GPIO_NUM     8
#define Y3_GPIO_NUM     9
#define Y2_GPIO_NUM     11
#define VSYNC_GPIO_NUM  6
#define HREF_GPIO_NUM   7
#define PCLK_GPIO_NUM   13

// ==============================================================================
// 3. GLOBAL OBJECTS & STATE
// ==============================================================================

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
String currentPairingCode = "------";
bool isPaired = false;
unsigned long lastHeartbeat = 0;
unsigned long lastCodePoll = 0;
unsigned long lastDriveCommandTime = 0;

httpd_handle_t stream_httpd = NULL;
httpd_handle_t control_httpd = NULL;

// ==============================================================================
// 4. MOTOR CONTROL FUNCTIONS
// ==============================================================================

void stopMotors();

void initMotors() {
  ledcAttach(MOTOR_LEFT_IN1,  PWM_FREQ, PWM_RES);
  ledcAttach(MOTOR_LEFT_IN2,  PWM_FREQ, PWM_RES);
  ledcAttach(MOTOR_RIGHT_IN3, PWM_FREQ, PWM_RES);
  ledcAttach(MOTOR_RIGHT_IN4, PWM_FREQ, PWM_RES);
  stopMotors();
  Serial.println("[Motors] L298N initialized on GPIO 38, 39, 40, 48.");
}

void setLeftMotor(int speed) {
  speed = constrain(speed, -255, 255);
  if (speed > 0) {
    ledcWrite(MOTOR_LEFT_IN1, speed);
    ledcWrite(MOTOR_LEFT_IN2, 0);
  } else if (speed < 0) {
    ledcWrite(MOTOR_LEFT_IN1, 0);
    ledcWrite(MOTOR_LEFT_IN2, abs(speed));
  } else {
    ledcWrite(MOTOR_LEFT_IN1, 0);
    ledcWrite(MOTOR_LEFT_IN2, 0);
  }
}

void setRightMotor(int speed) {
  speed = constrain(speed, -255, 255);
  if (speed > 0) {
    ledcWrite(MOTOR_RIGHT_IN3, speed);
    ledcWrite(MOTOR_RIGHT_IN4, 0);
  } else if (speed < 0) {
    ledcWrite(MOTOR_RIGHT_IN3, 0);
    ledcWrite(MOTOR_RIGHT_IN4, abs(speed));
  } else {
    ledcWrite(MOTOR_RIGHT_IN3, 0);
    ledcWrite(MOTOR_RIGHT_IN4, 0);
  }
}

void stopMotors() {
  ledcWrite(MOTOR_LEFT_IN1, 0);
  ledcWrite(MOTOR_LEFT_IN2, 0);
  ledcWrite(MOTOR_RIGHT_IN3, 0);
  ledcWrite(MOTOR_RIGHT_IN4, 0);
}

/**
 * Differential drive mapping:
 * x: -1.0 (left) to +1.0 (right)
 * y: -1.0 (reverse) to +1.0 (forward)
 */
void applyDifferentialDrive(float x, float y) {
  float left  = y + x;
  float right = y - x;

  // Clamp [-1.0, 1.0]
  left  = constrain(left, -1.0f, 1.0f);
  right = constrain(right, -1.0f, 1.0f);

  int leftPwm  = (int)(left * 255.0f);
  int rightPwm = (int)(right * 255.0f);

  setLeftMotor(leftPwm);
  setRightMotor(rightPwm);
}

// ==============================================================================
// 5. OLED DISPLAY ANIMATIONS & UI
// ==============================================================================

void initOLED() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[OLED] SSD1306 allocation failed (try 0x3D or check wiring).");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(24, 28);
    display.println("LUMI BOOTING...");
    display.display();
  }
}

void showPairingScreen(String code, String ipStr) {
  display.clearDisplay();

  // Header Title
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(34, 2);
  display.println("PAIR LUMI");

  // Divider Line
  display.drawFastHLine(10, 13, 108, SSD1306_WHITE);

  // Big 6-Digit Code (e.g. "482 917")
  display.setTextSize(2);
  display.setCursor(20, 18);
  String formatted = code;
  if (code.length() == 6) {
    formatted = code.substring(0, 3) + " " + code.substring(3);
  }
  display.println(formatted);

  // IP display
  display.setTextSize(1);
  display.setCursor(10, 38);
  display.print("IP: ");
  display.println(ipStr);

  // Bottom prompt
  display.setCursor(14, 52);
  display.println("Enter code in app");

  display.display();
}

void showHappyEyes(String ipStr) {
  display.clearDisplay();

  // Draw two friendly robot eyes
  // Left eye
  display.fillRoundRect(24, 12, 30, 28, 8, SSD1306_WHITE);
  display.fillCircle(39, 26, 6, SSD1306_BLACK);

  // Right eye
  display.fillRoundRect(74, 12, 30, 28, 8, SSD1306_WHITE);
  display.fillCircle(89, 26, 6, SSD1306_BLACK);

  // Status footer
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28, 44);
  display.println("LUMI ONLINE");

  display.setCursor(12, 55);
  display.print("IP: ");
  display.println(ipStr);

  display.display();
}

// ==============================================================================
// 6. CAMERA INITIALIZATION (OV3660)
// ==============================================================================

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_VGA;    // 640x480 for ultra-smooth video
  config.jpeg_quality = 12;               // 10-63 (lower = higher quality)
  config.fb_count     = 2;
  config.grab_mode    = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[Camera] Camera init failed with error 0x%x\n", err);
    return false;
  }

  // Sensor adjustments for OV3660
  sensor_t *s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_vflip(s, 1);    // Adjust orientation if needed
    s->set_hmirror(s, 0);
  }
  Serial.println("[Camera] OV3660 initialized successfully!");
  return true;
}

// ==============================================================================
// 7. HIGH-SPEED CAMERA & CONTROL WEB SERVER
// ==============================================================================

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t *_jpg_buf = NULL;
  char part_buf[128];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "X-Framerate", "30");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    _jpg_buf_len = fb->len;
    _jpg_buf = fb->buf;

    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    if (res == ESP_OK) {
      size_t hlen = snprintf(part_buf, 128, _STREAM_PART, (uint32_t)_jpg_buf_len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }

    esp_camera_fb_return(fb);
    if (res != ESP_OK) break;
    vTaskDelay(pdMS_TO_TICKS(15)); // ~30 fps cap
  }
  return res;
}

static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

static esp_err_t drive_handler(httpd_req_t *req) {
  char buf[128];
  if (httpd_req_get_url_query_str(req, buf, sizeof(buf)) == ESP_OK) {
    char param_x[32] = {0};
    char param_y[32] = {0};
    float x = 0.0f, y = 0.0f;

    if (httpd_query_key_value(buf, "x", param_x, sizeof(param_x)) == ESP_OK) {
      x = atof(param_x);
    }
    if (httpd_query_key_value(buf, "y", param_y, sizeof(param_y)) == ESP_OK) {
      y = atof(param_y);
    }

    applyDifferentialDrive(x, y);
    lastDriveCommandTime = millis();
  }

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, "{\"status\":\"ok\"}", HTTPD_RESP_USE_STRLEN);
}

static esp_err_t stop_handler(httpd_req_t *req) {
  stopMotors();
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, "{\"status\":\"stopped\"}", HTTPD_RESP_USE_STRLEN);
}

static esp_err_t index_handler(httpd_req_t *req) {
  const char* html = 
    "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>LUMI ROBOT</title><style>"
    "body{margin:0;background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;}"
    "h2{margin:12px 0 4px;font-size:20px;letter-spacing:1px;color:#38bdf8;}"
    ".cam-box{width:95%;max-width:560px;margin:10px auto;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.6);border:2px solid #334155;}"
    "img{width:100%;display:block;}"
    ".btns{display:grid;grid-template-columns:repeat(3,75px);grid-gap:10px;justify-content:center;margin:18px 0;}"
    "button{background:#1e293b;color:#fff;border:2px solid #475569;border-radius:12px;padding:16px;font-size:18px;font-weight:bold;cursor:pointer;touch-action:manipulation;}"
    "button:active{background:#38bdf8;color:#000;}"
    ".stop-btn{background:#ef4444;border-color:#b91c1c;}"
    "</style></head><body>"
    "<h2>🤖 LUMI LIVE CAMERA</h2>"
    "<div class='cam-box'><img src=':81/stream'></div>"
    "<div class='btns'>"
    "<div></div><button onpointerdown=\"d(0,1)\" onpointerup=\"s()\">⬆️</button><div></div>"
    "<button onpointerdown=\"d(-1,0)\" onpointerup=\"s()\">⬅️</button>"
    "<button class='stop-btn' onclick=\"s()\">🛑</button>"
    "<button onpointerdown=\"d(1,0)\" onpointerup=\"s()\">➡️</button>"
    "<div></div><button onpointerdown=\"d(0,-1)\" onpointerup=\"s()\">⬇️</button><div></div>"
    "</div>"
    "<script>"
    "function d(x,y){fetch('/drive?x='+x+'&y='+y);}"
    "function s(){fetch('/stop');}"
    "</script></body></html>";

  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
}

void startCameraServers() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = 8;

  // 1. Stream Server on Port 81
  httpd_config_t stream_config = config;
  stream_config.server_port = 81;
  stream_config.ctrl_port = 32769;

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&stream_httpd, &stream_config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[Web Server] MJPEG Streamer started on port 81 (http://<IP>:81/stream)");
  }

  // 2. Control & Snapshot Server on Port 80
  httpd_uri_t index_uri   = { .uri = "/",        .method = HTTP_GET, .handler = index_handler,   .user_ctx = NULL };
  httpd_uri_t capture_uri = { .uri = "/capture",  .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
  httpd_uri_t drive_uri   = { .uri = "/drive",    .method = HTTP_GET, .handler = drive_handler,   .user_ctx = NULL };
  httpd_uri_t stop_uri    = { .uri = "/stop",     .method = HTTP_GET, .handler = stop_handler,    .user_ctx = NULL };

  if (httpd_start(&control_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(control_httpd, &index_uri);
    httpd_register_uri_handler(control_httpd, &capture_uri);
    httpd_register_uri_handler(control_httpd, &drive_uri);
    httpd_register_uri_handler(control_httpd, &stop_uri);
    Serial.println("[Web Server] Control server started on port 80 (http://<IP>/)");
  }
}

// ==============================================================================
// 8. CLOUD INTEGRATION (SUPABASE REST)
// ==============================================================================

void callRegisterRobot() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip certificate verification for prototype

  HTTPClient https;
  String url = String(SUPABASE_BASE_URL) + "/functions/v1/register-robot";

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    String requestBody = "{\"lumi_id\":\"" + String(LUMI_ID) + 
                         "\",\"device_secret\":\"" + String(DEVICE_SECRET) + 
                         "\",\"local_ip\":\"" + WiFi.localIP().toString() + "\"}";

    int httpCode = https.POST(requestBody);

    if (httpCode > 0) {
      String payload = https.getString();
      Serial.printf("[Supabase] Code %d: %s\n", httpCode, payload.c_str());

      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, payload);

      if (!err) {
        const char* status = doc["status"];
        
        if (doc.containsKey("pairing_code")) {
          currentPairingCode = doc["pairing_code"].as<String>();
          Serial.println("==================================================");
          Serial.println("🎉 LUMI PAIRING CODE: " + currentPairingCode);
          Serial.println("📡 ROBOT IP ADDRESS : " + WiFi.localIP().toString());
          Serial.println("👉 Enter this 6-digit code in the LUMI Mobile App!");
          Serial.println("==================================================");
          showPairingScreen(currentPairingCode, WiFi.localIP().toString());
          isPaired = false;
        } else if (status && strcmp(status, "paired") == 0) {
          if (!isPaired) {
            Serial.println("🎉 Robot is paired to user account!");
            showHappyEyes(WiFi.localIP().toString());
            isPaired = true;
          }
        }
      }
    } else {
      Serial.printf("[Supabase] Failed to register: %s\n", https.errorToString(httpCode).c_str());
    }
    https.end();
  }
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED || !isPaired) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String url = String(SUPABASE_BASE_URL) + "/functions/v1/robot-heartbeat";

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    int rssi = WiFi.RSSI();
    int wifiBars = (rssi >= -60) ? 4 : (rssi >= -70) ? 3 : (rssi >= -80) ? 2 : 1;

    String requestBody = "{\"lumi_id\":\"" + String(LUMI_ID) + 
                         "\",\"device_secret\":\"" + String(DEVICE_SECRET) + 
                         "\",\"local_ip\":\"" + WiFi.localIP().toString() + 
                         "\",\"battery_percent\":92,\"wifi_signal\":" + String(wifiBars) + "}";

    int httpCode = https.POST(requestBody);
    https.end();
  }
}

// ==============================================================================
// 9. ARDUINO SETUP & MAIN LOOP
// ==============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- LUMI ESP32-S3 ROBOT STARTING ---");

  // 1. Initialize Peripherals
  initOLED();
  initMotors();
  initCamera();

  // 2. Connect Wi-Fi
  Serial.printf("[Wi-Fi] Connecting to %s...\n", WIFI_SSID);
  display.clearDisplay();
  display.setCursor(18, 28);
  display.println("Connecting Wi-Fi");
  display.display();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[Wi-Fi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    
    // 3. Start Camera Streaming & Direct Control Web Servers
    startCameraServers();

    // 4. Register with LUMI Supabase Cloud & display 6-digit code on OLED
    callRegisterRobot();
  } else {
    Serial.println("\n[Wi-Fi] Connection failed. Check SSID/Password.");
    display.clearDisplay();
    display.setCursor(12, 28);
    display.println("Wi-Fi Failed!");
    display.display();
  }
}

void loop() {
  unsigned long now = millis();

  // Failsafe: auto-stop motors if no drive commands received in 1.5 seconds
  if (lastDriveCommandTime > 0 && (now - lastDriveCommandTime > 1500)) {
    stopMotors();
    lastDriveCommandTime = 0;
  }

  // Poll for pairing status every 3 seconds while in setup mode
  if (!isPaired && (now - lastCodePoll > 3000)) {
    lastCodePoll = now;
    callRegisterRobot();
  }

  // Send telemetry heartbeat every 10 seconds once paired
  if (isPaired && (now - lastHeartbeat > 10000)) {
    lastHeartbeat = now;
    sendHeartbeat();
  }

  delay(10);
}
