#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

// Hardware I2C Pins for GOOUUU ESP32-S3-CAM V1.5 OLED
#define OLED_I2C_SDA_PIN    21
#define OLED_I2C_SCL_PIN    47
#define OLED_I2C_PORT       0
#define OLED_I2C_FREQ_HZ    400000

#define OLED_WIDTH          128
#define OLED_HEIGHT         64
#define OLED_I2C_ADDR       0x3C

/**
 * Initialize I2C and SSD1306 OLED display.
 */
esp_err_t oled_init(void);

/**
 * Clear the screen buffer and update OLED.
 */
void oled_clear(void);

/**
 * Display the 6-digit LUMI cloud pairing code screen.
 */
void oled_show_pairing_screen(const char *code);

/**
 * Display the Wi-Fi Provisioning & Hotspot Setup screen.
 */
void oled_show_wifi_setup_screen(const char *ap_ssid);

/**
 * Render eyes by mood and gaze direction.
 * mood: 0=Happy, 1=Neutral, 2=Sleep, 3=Angry, 4=Upset, 5=Sad, 6=Love
 * lookDir: 0=Center, 1=Left, 2=Right
 */
void oled_draw_eyes(int mood, int lookDir);

/**
 * Trigger an instant eye blink animation.
 */
void oled_draw_blink(void);

/**
 * Trigger an instant winking eye animation.
 */
void oled_draw_wink(void);

/**
 * Set emotion by string name (from LiveKit DataChannel).
 * Supported: "happy", "curious", "love", "excited", "wink", "sleep", "sleepy", "angry", "upset", "sad", "neutral"
 */
void oled_set_emotion_by_name(const char *name);

/**
 * Start the FreeRTOS background eye animation & natural blinking task.
 */
void oled_start_animation_task(void);

/**
 * Set whether robot is paired. Once paired, display switches from code to animated eyes.
 */
void oled_set_paired(bool paired);

/**
 * Set fine-grained analog gaze offset from joystick (-1.0 to +1.0 for X and Y).
 */
void oled_set_gaze_offset(float x_ratio, float y_ratio);

#ifdef __cplusplus
}
#endif
