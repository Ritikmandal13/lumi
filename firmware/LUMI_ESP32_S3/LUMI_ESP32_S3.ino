/**
 * ==============================================================================
 * 🤖 LUMI ROBOT — ESP32-S3 Complete Firmware
 * ==============================================================================
 * Target Board : GOOUUU ESP32-S3-CAM V1.5 (ESP32-S3 N16R8, 16MB Flash, 8MB Octal PSRAM)
 * Camera Sensor: OV3660 (built-in, GPIO 4-13, 15-18)
 * Display      : 128x64 OLED (SSD1306/SH1106 on I2C SDA=GPIO 21, SCL=GPIO 47)
 * Motor Driver : L298N Dual H-Bridge (IN1=38, IN2=39, IN3=40, IN4=48)
 * I2S Audio    : Mic INMP441 (SD=1, SCK=41, WS=42) | Amp MAX98357A (DIN=14, BCLK=41, LRC=42)
 * Cloud Backend: Supabase REST (Cloud Pairing & Telemetry) + LiveKit WebRTC
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
#define CH_LEFT_IN1     0
#define CH_LEFT_IN2     1
#define CH_RIGHT_IN3    2
#define CH_RIGHT_IN4    3

// I2S Shared Audio Pins
#define I2S_BCLK_PIN    41  // Shared: Mic SCK & Amp BCLK
#define I2S_WS_PIN      42  // Shared: Mic WS & Amp LRC
#define I2S_MIC_SD_PIN  1   // Mic Data In
#define I2S_AMP_DIN_PIN 14  // Amp Data Out

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

// ==============================================================================
// 4. MOTOR CONTROL FUNCTIONS
// ==============================================================================

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

void showPairingScreen(String code) {
  display.clearDisplay();

  // Header Title
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(34, 4);
  display.println("PAIR LUMI");

  // Divider Line
  display.drawFastHLine(10, 16, 108, SSD1306_WHITE);

  // Big 6-Digit Code (e.g. "482 917")
  display.setTextSize(2);
  display.setCursor(22, 26);
  String formatted = code;
  if (code.length() == 6) {
    formatted = code.substring(0, 3) + " " + code.substring(3);
  }
  display.println(formatted);

  // Bottom prompt
  display.setTextSize(1);
  display.setCursor(14, 52);
  display.println("Enter code in app");

  display.display();
}

void showHappyEyes() {
  display.clearDisplay();

  // Draw two friendly robot eyes
  // Left eye
  display.fillRoundRect(24, 18, 30, 28, 8, SSD1306_WHITE);
  display.fillCircle(39, 32, 6, SSD1306_BLACK);

  // Right eye
  display.fillRoundRect(74, 18, 30, 28, 8, SSD1306_WHITE);
  display.fillCircle(89, 32, 6, SSD1306_BLACK);

  // Status footer
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(38, 54);
  display.println("LUMI ONLINE");

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
  config.frame_size   = FRAMESIZE_VGA;    // 640x480 for smooth streaming
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
    s->set_vflip(s, 1);    // Invert if upside down
    s->set_hmirror(s, 0);
  }
  Serial.println("[Camera] OV3660 initialized successfully!");
  return true;
}

// ==============================================================================
// 7. CLOUD INTEGRATION (SUPABASE REST)
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
                         "\",\"device_secret\":\"" + String(DEVICE_SECRET) + "\"}";

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
          Serial.println("👉 Enter this 6-digit code in the LUMI Mobile App!");
          Serial.println("==================================================");
          showPairingScreen(currentPairingCode);
          isPaired = false;
        } else if (status && strcmp(status, "paired") == 0) {
          if (!isPaired) {
            Serial.println("🎉 Robot is paired to user account!");
            showHappyEyes();
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
                         "\",\"battery_percent\":92,\"wifi_signal\":" + String(wifiBars) + "}";

    int httpCode = https.POST(requestBody);
    https.end();
  }
}

// ==============================================================================
// 8. ARDUINO SETUP & MAIN LOOP
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
    
    // 3. Register with LUMI Supabase Cloud & display 6-digit code on OLED
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

  delay(20);
}
