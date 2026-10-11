/**
 * OLED Display & Eye Animation Driver for LUMI (ESP-IDF)
 * Controller: SSD1306 / SH1106 over I2C
 * Pins: SDA=GPIO 21, SCL=GPIO 47
 */

#include "oled.h"
#include "lumi_eyes.h"
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "LUMI_OLED";

// 128x64 Monochrome Framebuffer (1024 bytes)
static uint8_t s_framebuffer[1024];
static bool s_oled_ready = false;
static bool s_is_paired = false;
static int s_current_mood = 1;     // Default: Neutral
static int s_current_look_dir = 0; // Default: Center
static portMUX_TYPE s_oled_mux = portMUX_INITIALIZER_UNLOCKED;

// Standard 5x7 ASCII font table (ASCII 32-126)
static const uint8_t font5x7[] = {
    0x00, 0x00, 0x00, 0x00, 0x00, // Space
    0x00, 0x00, 0x5F, 0x00, 0x00, // !
    0x00, 0x07, 0x00, 0x07, 0x00, // "
    0x14, 0x7F, 0x14, 0x7F, 0x14, // #
    0x24, 0x2A, 0x7F, 0x2A, 0x12, // $
    0x23, 0x13, 0x08, 0x64, 0x62, // %
    0x36, 0x49, 0x55, 0x22, 0x50, // &
    0x00, 0x05, 0x03, 0x00, 0x00, // '
    0x00, 0x1C, 0x22, 0x41, 0x00, // (
    0x00, 0x41, 0x22, 0x1C, 0x00, // )
    0x14, 0x08, 0x3E, 0x08, 0x14, // *
    0x08, 0x08, 0x3E, 0x08, 0x08, // +
    0x00, 0x50, 0x30, 0x00, 0x00, // ,
    0x08, 0x08, 0x08, 0x08, 0x08, // -
    0x00, 0x60, 0x60, 0x00, 0x00, // .
    0x20, 0x10, 0x08, 0x04, 0x02, // /
    0x3E, 0x51, 0x49, 0x45, 0x3E, // 0
    0x00, 0x42, 0x7F, 0x40, 0x00, // 1
    0x42, 0x61, 0x51, 0x49, 0x46, // 2
    0x21, 0x41, 0x45, 0x4B, 0x31, // 3
    0x18, 0x14, 0x12, 0x7F, 0x10, // 4
    0x27, 0x45, 0x45, 0x45, 0x39, // 5
    0x3C, 0x4A, 0x49, 0x49, 0x30, // 6
    0x01, 0x71, 0x09, 0x05, 0x03, // 7
    0x36, 0x49, 0x49, 0x49, 0x36, // 8
    0x06, 0x49, 0x49, 0x29, 0x1E, // 9
    0x00, 0x36, 0x36, 0x00, 0x00, // :
    0x00, 0x56, 0x36, 0x00, 0x00, // ;
    0x08, 0x14, 0x22, 0x41, 0x00, // <
    0x14, 0x14, 0x14, 0x14, 0x14, // =
    0x00, 0x41, 0x22, 0x14, 0x08, // >
    0x02, 0x01, 0x51, 0x09, 0x06, // ?
    0x32, 0x49, 0x79, 0x41, 0x3E, // @
    0x7E, 0x11, 0x11, 0x11, 0x7E, // A
    0x7F, 0x49, 0x49, 0x49, 0x36, // B
    0x3E, 0x41, 0x41, 0x41, 0x22, // C
    0x7F, 0x41, 0x41, 0x22, 0x1C, // D
    0x7F, 0x49, 0x49, 0x49, 0x41, // E
    0x7F, 0x09, 0x09, 0x09, 0x01, // F
    0x3E, 0x41, 0x49, 0x49, 0x7A, // G
    0x7F, 0x08, 0x08, 0x08, 0x7F, // H
    0x00, 0x41, 0x7F, 0x41, 0x00, // I
    0x20, 0x40, 0x41, 0x3F, 0x01, // J
    0x7F, 0x08, 0x14, 0x22, 0x41, // K
    0x7F, 0x40, 0x40, 0x40, 0x40, // L
    0x7F, 0x02, 0x0C, 0x02, 0x7F, // M
    0x7F, 0x04, 0x08, 0x10, 0x7F, // N
    0x3E, 0x41, 0x41, 0x41, 0x3E, // O
    0x7F, 0x09, 0x09, 0x09, 0x06, // P
    0x3E, 0x41, 0x51, 0x21, 0x5E, // Q
    0x7F, 0x09, 0x19, 0x29, 0x46, // R
    0x46, 0x49, 0x49, 0x49, 0x31, // S
    0x01, 0x01, 0x7F, 0x01, 0x01, // T
    0x3F, 0x40, 0x40, 0x40, 0x3F, // U
    0x1F, 0x20, 0x40, 0x20, 0x1F, // V
    0x7F, 0x20, 0x18, 0x20, 0x7F, // W
    0x63, 0x14, 0x08, 0x14, 0x63, // X
    0x07, 0x08, 0x70, 0x08, 0x07, // Y
    0x61, 0x51, 0x49, 0x45, 0x43  // Z
};

static esp_err_t ssd1306_write_cmd(uint8_t cmd) {
    i2c_cmd_handle_t handle = i2c_cmd_link_create();
    i2c_master_start(handle);
    i2c_master_write_byte(handle, (OLED_I2C_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(handle, 0x00, true); // Control byte: Command
    i2c_master_write_byte(handle, cmd, true);
    i2c_master_stop(handle);
    esp_err_t ret = i2c_master_cmd_begin(OLED_I2C_PORT, handle, pdMS_TO_TICKS(50));
    i2c_cmd_link_delete(handle);
    return ret;
}

static esp_err_t ssd1306_render(void) {
    if (!s_oled_ready) return ESP_FAIL;

    // Send full 1024-byte framebuffer in 8 pages (128 bytes each)
    for (uint8_t page = 0; page < 8; page++) {
        ssd1306_write_cmd(0xB0 + page); // Set page start address
        ssd1306_write_cmd(0x00);        // Set lower column address
        ssd1306_write_cmd(0x10);        // Set higher column address

        i2c_cmd_handle_t handle = i2c_cmd_link_create();
        i2c_master_start(handle);
        i2c_master_write_byte(handle, (OLED_I2C_ADDR << 1) | I2C_MASTER_WRITE, true);
        i2c_master_write_byte(handle, 0x40, true); // Control byte: Data
        i2c_master_write(handle, &s_framebuffer[page * 128], 128, true);
        i2c_master_stop(handle);
        i2c_master_cmd_begin(OLED_I2C_PORT, handle, pdMS_TO_TICKS(50));
        i2c_cmd_link_delete(handle);
    }
    return ESP_OK;
}

static void draw_pixel(int x, int y, bool color) {
    if (x < 0 || x >= OLED_WIDTH || y < 0 || y >= OLED_HEIGHT) return;
    int index = x + (y / 8) * OLED_WIDTH;
    uint8_t mask = 1 << (y % 8);
    if (color) {
        s_framebuffer[index] |= mask;
    } else {
        s_framebuffer[index] &= ~mask;
    }
}

static void draw_char(int x, int y, char c, int scale) {
    if (c < 32 || c > 'Z') return;
    const uint8_t *glyph = &font5x7[(c - 32) * 5];
    for (int col = 0; col < 5; col++) {
        uint8_t line = glyph[col];
        for (int row = 0; row < 7; row++) {
            if ((line >> row) & 0x01) {
                for (int sx = 0; sx < scale; sx++) {
                    for (int sy = 0; sy < scale; sy++) {
                        draw_pixel(x + col * scale + sx, y + row * scale + sy, true);
                    }
                }
            }
        }
    }
}

static void draw_string(int x, int y, const char *str, int scale) {
    int cur_x = x;
    while (*str) {
        draw_char(cur_x, y, *str, scale);
        cur_x += (5 + 1) * scale;
        str++;
    }
}

static void draw_bitmap(int x, int y, const uint8_t *bitmap, int w, int h) {
    int bytes_per_row = (w + 7) / 8;
    for (int j = 0; j < h; j++) {
        for (int i = 0; i < w; i++) {
            uint8_t byte = bitmap[j * bytes_per_row + (i / 8)];
            if ((byte >> (7 - (i % 8))) & 0x01) {
                draw_pixel(x + i, y + j, true);
            }
        }
    }
}

esp_err_t oled_init(void) {
    ESP_LOGI(TAG, "Initializing I2C bus (SDA: GPIO %d, SCL: GPIO %d)...", OLED_I2C_SDA_PIN, OLED_I2C_SCL_PIN);

    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = OLED_I2C_SDA_PIN,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_io_num = OLED_I2C_SCL_PIN,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = OLED_I2C_FREQ_HZ,
    };
    esp_err_t err = i2c_param_config(OLED_I2C_PORT, &conf);
    if (err != ESP_OK) return err;

    err = i2c_driver_install(OLED_I2C_PORT, conf.mode, 0, 0, 0);
    if (err != ESP_OK) return err;

    // SSD1306 Initialization sequence
    const uint8_t init_cmds[] = {
        0xAE,       // Display OFF
        0xD5, 0x80, // Set Display Clock Divide
        0xA8, 0x3F, // Set Multiplex Ratio (64 lines)
        0xD3, 0x00, // Display Offset = 0
        0x40,       // Start Line = 0
        0x8D, 0x14, // Charge Pump Enable
        0x20, 0x00, // Horizontal Addressing Mode
        0xA1,       // Segment Re-map (Col 127 mapped to SEG0)
        0xC8,       // COM Output Scan Direction
        0xDA, 0x12, // COM Pins Hardware Config
        0x81, 0xCF, // Contrast Control
        0xD9, 0xF1, // Pre-charge Period
        0xDB, 0x40, // VCOMH Deselect Level
        0xA4,       // Entire Display Resume
        0xA6,       // Normal Display
        0xAF        // Display ON
    };

    for (size_t i = 0; i < sizeof(init_cmds); i++) {
        ssd1306_write_cmd(init_cmds[i]);
    }

    s_oled_ready = true;
    oled_clear();
    ESP_LOGI(TAG, "SSD1306 OLED Display successfully initialized at 0x%02X!", OLED_I2C_ADDR);
    return ESP_OK;
}

void oled_clear(void) {
    taskENTER_CRITICAL(&s_oled_mux);
    memset(s_framebuffer, 0, sizeof(s_framebuffer));
    taskEXIT_CRITICAL(&s_oled_mux);
    ssd1306_render();
}

void oled_show_pairing_screen(const char *code) {
    if (!s_oled_ready) return;

    taskENTER_CRITICAL(&s_oled_mux);
    memset(s_framebuffer, 0, sizeof(s_framebuffer));

    // Header Title
    draw_string(34, 4, "PAIR LUMI", 1);

    // Divider Line (y=16, 108px wide)
    for (int x = 10; x < 118; x++) {
        draw_pixel(x, 16, true);
    }

    // 6-Digit Code with space in middle: e.g. "482 917"
    char formatted[16];
    if (strlen(code) == 6) {
        snprintf(formatted, sizeof(formatted), "%.3s %.3s", code, code + 3);
    } else {
        snprintf(formatted, sizeof(formatted), "%s", code);
    }
    draw_string(22, 26, formatted, 2);

    // Bottom prompt
    draw_string(14, 52, "ENTER IN APP", 1);
    taskEXIT_CRITICAL(&s_oled_mux);

    ssd1306_render();
}

void oled_draw_eyes(int mood, int lookDir) {
    if (!s_oled_ready) return;
    if (mood < 0) mood = 0;
    if (mood > 6) mood = 6;
    if (lookDir < 0) lookDir = 0;
    if (lookDir > 2) lookDir = 2;

    taskENTER_CRITICAL(&s_oled_mux);
    memset(s_framebuffer, 0, sizeof(s_framebuffer));
    draw_bitmap(18, 16, peyes[mood][lookDir][0], 32, 32);
    draw_bitmap(78, 16, peyes[mood][lookDir][1], 32, 32);
    taskEXIT_CRITICAL(&s_oled_mux);

    ssd1306_render();
}

void oled_draw_blink(void) {
    if (!s_oled_ready) return;

    taskENTER_CRITICAL(&s_oled_mux);
    memset(s_framebuffer, 0, sizeof(s_framebuffer));
    draw_bitmap(18, 16, eye0, 32, 32);
    draw_bitmap(78, 16, eye0, 32, 32);
    taskEXIT_CRITICAL(&s_oled_mux);

    ssd1306_render();
}

void oled_set_emotion_by_name(const char *name) {
    if (!name) return;
    if (strcmp(name, "happy") == 0)      s_current_mood = 0;
    else if (strcmp(name, "neutral") == 0) s_current_mood = 1;
    else if (strcmp(name, "curious") == 0) s_current_mood = 1;
    else if (strcmp(name, "sleep") == 0)   s_current_mood = 2;
    else if (strcmp(name, "angry") == 0)   s_current_mood = 3;
    else if (strcmp(name, "upset") == 0)   s_current_mood = 4;
    else if (strcmp(name, "sad") == 0)     s_current_mood = 5;
    else if (strcmp(name, "love") == 0)    s_current_mood = 6;

    if (s_is_paired) {
        oled_draw_eyes(s_current_mood, s_current_look_dir);
    }
}

void oled_set_paired(bool paired) {
    s_is_paired = paired;
    if (paired) {
        oled_draw_eyes(s_current_mood, s_current_look_dir);
    }
}

static void oled_animation_task_func(void *pvParameters) {
    while (1) {
        if (s_is_paired && s_oled_ready) {
            // Natural blink every 2.5 - 5.5 seconds
            int interval_ms = 2500 + (rand() % 3000);
            vTaskDelay(pdMS_TO_TICKS(interval_ms));

            // Eye close
            oled_draw_blink();
            vTaskDelay(pdMS_TO_TICKS(80)); // 80ms blink duration

            // Eye reopen to current mood
            oled_draw_eyes(s_current_mood, s_current_look_dir);
        } else {
            vTaskDelay(pdMS_TO_TICKS(500));
        }
    }
}

void oled_start_animation_task(void) {
    xTaskCreate(oled_animation_task_func, "oled_anim_task", 4096, NULL, 5, NULL);
}
