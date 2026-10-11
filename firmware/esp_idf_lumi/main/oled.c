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
#include "driver/i2c_master.h"
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

// Modern ESP-IDF v5 I2C Handles
static i2c_master_bus_handle_t s_i2c_bus = NULL;
static i2c_master_dev_handle_t s_oled_dev = NULL;

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
    if (!s_oled_dev) return ESP_FAIL;
    uint8_t buf[2] = {0x00, cmd};
    return i2c_master_transmit(s_oled_dev, buf, sizeof(buf), 100);
}

static esp_err_t ssd1306_render(void) {
    if (!s_oled_ready || !s_oled_dev) return ESP_FAIL;

    // Send full 1024-byte framebuffer in 8 pages (128 bytes each)
    for (uint8_t page = 0; page < 8; page++) {
        ssd1306_write_cmd(0xB0 + page); // Set page start address
        ssd1306_write_cmd(0x00);        // Set lower column address
        ssd1306_write_cmd(0x10);        // Set higher column address

        uint8_t page_buf[129];
        page_buf[0] = 0x40; // Control byte: Data
        memcpy(&page_buf[1], &s_framebuffer[page * 128], 128);
        esp_err_t err = i2c_master_transmit(s_oled_dev, page_buf, sizeof(page_buf), 200);
        if (err != ESP_OK) {
            return err;
        }
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
    ESP_LOGI(TAG, "Initializing I2C master bus (SDA: GPIO %d, SCL: GPIO %d)...", OLED_I2C_SDA_PIN, OLED_I2C_SCL_PIN);

    i2c_master_bus_config_t bus_config = {
        .i2c_port = -1, // Auto-select available I2C port to avoid collision
        .sda_io_num = OLED_I2C_SDA_PIN,
        .scl_io_num = OLED_I2C_SCL_PIN,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    esp_err_t err = i2c_new_master_bus(&bus_config, &s_i2c_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_new_master_bus failed: %s", esp_err_to_name(err));
        return err;
    }

    // Auto-detect OLED I2C Address (0x3C or 0x3D)
    uint8_t target_addr = 0;
    if (i2c_master_probe(s_i2c_bus, 0x3C, 50) == ESP_OK) {
        target_addr = 0x3C;
        ESP_LOGI(TAG, "Found OLED display at address 0x3C!");
    } else if (i2c_master_probe(s_i2c_bus, 0x3D, 50) == ESP_OK) {
        target_addr = 0x3D;
        ESP_LOGI(TAG, "Found OLED display at address 0x3D!");
    } else {
        // Run bus scan to see if any device responds
        ESP_LOGW(TAG, "OLED not found at 0x3C or 0x3D. Scanning I2C bus (0x01 - 0x7E)...");
        for (uint8_t a = 1; a < 127; a++) {
            if (i2c_master_probe(s_i2c_bus, a, 20) == ESP_OK) {
                ESP_LOGI(TAG, " -> Found I2C device responding at 0x%02X!", a);
                if (target_addr == 0) target_addr = a;
            }
        }
    }

    if (target_addr == 0) {
        ESP_LOGE(TAG, "❌ No OLED display detected on SDA (GPIO %d), SCL (GPIO %d)!", OLED_I2C_SDA_PIN, OLED_I2C_SCL_PIN);
        ESP_LOGE(TAG, "👉 Check physical wiring: OLED VCC->3.3V, GND->GND, SCL->GPIO47, SDA->GPIO21");
        s_oled_ready = false;
        return ESP_ERR_NOT_FOUND;
    }

    i2c_device_config_t dev_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = target_addr,
        .scl_speed_hz = OLED_I2C_FREQ_HZ,
    };
    err = i2c_master_bus_add_device(s_i2c_bus, &dev_config, &s_oled_dev);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_master_bus_add_device failed: %s", esp_err_to_name(err));
        return err;
    }

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
        esp_err_t cmd_err = ssd1306_write_cmd(init_cmds[i]);
        if (cmd_err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to send init cmd 0x%02X: %s", init_cmds[i], esp_err_to_name(cmd_err));
        }
    }

    s_oled_ready = true;
    oled_clear();
    ESP_LOGI(TAG, "SSD1306 OLED Display successfully initialized at 0x%02X!", target_addr);
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
