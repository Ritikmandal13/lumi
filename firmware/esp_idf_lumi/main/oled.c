/**
 * OLED Display & Procedural Eye Animation Driver for LUMI (ESP-IDF)
 * Controller: SSD1306 / SH1106 over I2C
 * Pins: SDA=GPIO 21, SCL=GPIO 47
 * 
 * Features:
 * - Pure procedural geometric rasterization (zero static bitmap tables)
 * - Parametric rounded rectangle capsules with dynamic corner radii
 * - Continuous angled eyelid clipping (happy arcs, angry slants, sleepy droops)
 * - 4-phase biological blinking with overshoot bounce & random double-blinks
 * - Autonomous micro-saccades (1-2px subtle attention jitter)
 * - Smooth exponential easing / morphing across emotions
 * - Procedural beating heart eyes for "love"
 * - Dynamic continuous gaze tracking (cardinal + analog joystick offsets)
 */

#include "oled.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include "esp_log.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "LUMI_OLED";

#define FRAME_PERIOD_MS     30  // ~33.3 FPS
#define DEG_TO_RAD          0.017453292519943295f

// 128x64 Monochrome Framebuffer (1024 bytes)
static uint8_t s_framebuffer[1024];
static bool s_oled_ready = false;
static bool s_is_paired = false;
static bool s_pairing_screen_active = false;

static int s_current_mood = 1;     // Default: Neutral
static int s_current_look_dir = 0; // Default: Center
static portMUX_TYPE s_oled_mux = portMUX_INITIALIZER_UNLOCKED;

// Modern ESP-IDF v5 I2C Handles
static i2c_master_bus_handle_t s_i2c_bus = NULL;
static i2c_master_dev_handle_t s_oled_dev = NULL;

// Procedural Eye State Struct
typedef struct {
    float cx, cy;            // Eye center position
    float width, height;     // Dimensions
    float radius;            // Corner roundness
    float top_lid_h;         // 0.0 (wide open) to 1.0 (shut down)
    float top_lid_angle;     // Angle in degrees (-30 to +30)
    float bottom_lid_h;      // 0.0 (wide open) to 1.0 (squinting up)
    float bottom_lid_angle;  // Angle in degrees (-30 to +30)
    float pupil_x, pupil_y;  // Pupil cutout center offset
    float pupil_r;           // Pupil cutout radius (0.0 = solid eye)
    bool is_heart;           // Heart-shaped love eyes
} eye_param_t;

// Live animated parameters (smoothly interpolated every frame)
static eye_param_t s_eye_l;
static eye_param_t s_eye_r;

// Gaze & Saccade state
static float s_gaze_x = 0.0f;
static float s_gaze_y = 0.0f;
static float s_target_gaze_x = 0.0f;
static float s_target_gaze_y = 0.0f;

static float s_saccade_x = 0.0f;
static float s_saccade_y = 0.0f;
static int s_saccade_timer_ms = 2400;
static int s_saccade_hold_ms = 0;

// Blink State Machine
typedef enum {
    BLINK_IDLE = 0,
    BLINK_CLOSING,
    BLINK_CLOSED,
    BLINK_OPENING
} blink_state_t;

static blink_state_t s_blink_state = BLINK_IDLE;
static int s_blink_timer_ms = 3200;
static int s_blink_phase_ms = 0;
static float s_blink_progress = 0.0f; // 0.0 = fully open, 1.0 = fully shut

// Wink state
static bool s_wink_active = false;
static int s_wink_timer_ms = 0;

// Love heartbeat phase
static float s_heartbeat_phase = 0.0f;

// Standard 5x7 ASCII font table (ASCII 32-126) for pairing screen
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
        esp_err_t err = i2c_master_transmit(s_oled_dev, page_buf, sizeof(page_buf), 150);
        if (err != ESP_OK) {
            return err;
        }
    }
    return ESP_OK;
}

static inline void draw_pixel(int x, int y, bool color) {
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
    if (c >= 'a' && c <= 'z') c = c - 32;
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

static inline float lerp_f(float cur, float tgt, float rate) {
    return cur + (tgt - cur) * rate;
}

/**
 * Procedural filled cartoon heart for "love" emotion
 */
static void draw_procedural_heart(float cx, float cy, float w, float h) {
    int min_x = (int)(cx - w * 0.5f);
    int max_x = (int)(cx + w * 0.5f);
    int min_y = (int)(cy - h * 0.55f);
    int max_y = (int)(cy + h * 0.55f);

    if (min_x < 0) min_x = 0;
    if (max_x >= OLED_WIDTH) max_x = OLED_WIDTH - 1;
    if (min_y < 0) min_y = 0;
    if (max_y >= OLED_HEIGHT) max_y = OLED_HEIGHT - 1;

    float r = w * 0.25f;
    float left_circle_x = cx - r;
    float right_circle_x = cx + r;
    float circle_y = cy - h * 0.15f;
    float r_sq = r * r;
    float bottom_y = cy + h * 0.45f;

    for (int x = min_x; x <= max_x; x++) {
        float fx = (float)x;
        for (int y = min_y; y <= max_y; y++) {
            float fy = (float)y;
            bool inside = false;

            // Check top lobes
            float dxl = fx - left_circle_x;
            float dyl = fy - circle_y;
            if (dxl * dxl + dyl * dyl <= r_sq) {
                inside = true;
            } else {
                float dxr = fx - right_circle_x;
                float dyr = fy - circle_y;
                if (dxr * dxr + dyr * dyr <= r_sq) {
                    inside = true;
                }
            }

            // Check bottom tapering triangle
            if (!inside && fy >= circle_y && fy <= bottom_y) {
                float t = (fy - circle_y) / (bottom_y - circle_y + 0.001f);
                float half_w_at_y = (w * 0.5f) * (1.0f - t);
                if (fabsf(fx - cx) <= half_w_at_y) {
                    inside = true;
                }
            }

            if (inside) {
                draw_pixel(x, y, true);
            }
        }
    }
}

/**
 * Procedural filled rounded rectangle with angled eyelid half-plane clipping
 */
static void draw_procedural_eye(const eye_param_t *eye) {
    if (eye->is_heart) {
        draw_procedural_heart(eye->cx, eye->cy, eye->width, eye->height);
        return;
    }

    float half_w = eye->width * 0.5f;
    float half_h = eye->height * 0.5f;
    if (half_w <= 1.0f || half_h <= 1.0f) return;

    int min_x = (int)(eye->cx - half_w);
    int max_x = (int)(eye->cx + half_w);
    int min_y = (int)(eye->cy - half_h);
    int max_y = (int)(eye->cy + half_h);

    if (min_x < 0) min_x = 0;
    if (max_x >= OLED_WIDTH) max_x = OLED_WIDTH - 1;
    if (min_y < 0) min_y = 0;
    if (max_y >= OLED_HEIGHT) max_y = OLED_HEIGHT - 1;

    float r = eye->radius;
    if (r > half_w) r = half_w;
    if (r > half_h) r = half_h;
    if (r < 0.5f) r = 0.5f;
    float r_sq = r * r;

    float inner_left   = eye->cx - half_w + r;
    float inner_right  = eye->cx + half_w - r;
    float inner_top    = eye->cy - half_h + r;
    float inner_bottom = eye->cy + half_h - r;

    // Eyelid cut lines
    float top_cut_y = (eye->cy - half_h) + eye->height * eye->top_lid_h;
    float top_slope = tanf(eye->top_lid_angle * DEG_TO_RAD);

    float bot_cut_y = (eye->cy + half_h) - eye->height * eye->bottom_lid_h;
    float bot_slope = tanf(eye->bottom_lid_angle * DEG_TO_RAD);

    float pupil_cx = eye->cx + eye->pupil_x;
    float pupil_cy = eye->cy + eye->pupil_y;
    float pupil_r_sq = eye->pupil_r * eye->pupil_r;

    for (int x = min_x; x <= max_x; x++) {
        float dx_c = (float)x - eye->cx;
        float y_top_limit = top_cut_y + top_slope * dx_c;
        float y_bot_limit = bot_cut_y + bot_slope * dx_c;

        for (int y = min_y; y <= max_y; y++) {
            // Eyelid masking
            if ((float)y < y_top_limit) continue;
            if ((float)y > y_bot_limit) continue;

            // Rounded corner test
            if ((float)x < inner_left) {
                if ((float)y < inner_top) {
                    float dx = (float)x - inner_left;
                    float dy = (float)y - inner_top;
                    if (dx * dx + dy * dy > r_sq) continue;
                } else if ((float)y > inner_bottom) {
                    float dx = (float)x - inner_left;
                    float dy = (float)y - inner_bottom;
                    if (dx * dx + dy * dy > r_sq) continue;
                }
            } else if ((float)x > inner_right) {
                if ((float)y < inner_top) {
                    float dx = (float)x - inner_right;
                    float dy = (float)y - inner_top;
                    if (dx * dx + dy * dy > r_sq) continue;
                } else if ((float)y > inner_bottom) {
                    float dx = (float)x - inner_right;
                    float dy = (float)y - inner_bottom;
                    if (dx * dx + dy * dy > r_sq) continue;
                }
            }

            // Inverted pupil/glint cutout
            if (eye->pupil_r > 0.5f) {
                float px = (float)x - pupil_cx;
                float py = (float)y - pupil_cy;
                if (px * px + py * py <= pupil_r_sq) {
                    continue;
                }
            }

            draw_pixel(x, y, true);
        }
    }
}

/**
 * Calculate target geometric shape parameters for each emotion & look direction
 */
static void compute_mood_targets(int mood, int look_dir, eye_param_t *tl, eye_param_t *tr) {
    // Balanced center spacing on 128x64 display
    tl->cx = 38.0f;
    tl->cy = 32.0f;
    tr->cx = 90.0f;
    tr->cy = 32.0f;

    tl->width = 28.0f;
    tl->height = 34.0f;
    tl->radius = 9.0f;
    tl->top_lid_h = 0.0f;
    tl->top_lid_angle = 0.0f;
    tl->bottom_lid_h = 0.0f;
    tl->bottom_lid_angle = 0.0f;
    tl->pupil_x = 0.0f;
    tl->pupil_y = 0.0f;
    tl->pupil_r = 0.0f;
    tl->is_heart = false;

    tr->width = 28.0f;
    tr->height = 34.0f;
    tr->radius = 9.0f;
    tr->top_lid_h = 0.0f;
    tr->top_lid_angle = 0.0f;
    tr->bottom_lid_h = 0.0f;
    tr->bottom_lid_angle = 0.0f;
    tr->pupil_x = 0.0f;
    tr->pupil_y = 0.0f;
    tr->pupil_r = 0.0f;
    tr->is_heart = false;

    switch (mood) {
        case 0: // HAPPY - Cute upward curved smiling arches
            tl->width = 30.0f; tl->height = 28.0f; tl->radius = 8.0f;
            tr->width = 30.0f; tr->height = 28.0f; tr->radius = 8.0f;
            tl->bottom_lid_h = 0.52f; tl->bottom_lid_angle = 12.0f;
            tr->bottom_lid_h = 0.52f; tr->bottom_lid_angle = -12.0f;
            break;

        case 1: // NEUTRAL - Friendly, awake tall capsules
            tl->width = 28.0f; tl->height = 34.0f; tl->radius = 9.0f;
            tr->width = 28.0f; tr->height = 34.0f; tr->radius = 9.0f;
            break;

        case 2: // SLEEP / SLEEPY - Drooping relaxed eyelids
            tl->width = 28.0f; tl->height = 22.0f; tl->radius = 5.0f;
            tr->width = 28.0f; tr->height = 22.0f; tr->radius = 5.0f;
            tl->cy = 35.0f; tr->cy = 35.0f;
            tl->top_lid_h = 0.65f; tl->top_lid_angle = -6.0f;
            tr->top_lid_h = 0.65f; tr->top_lid_angle = +6.0f;
            tl->bottom_lid_h = 0.12f; tr->bottom_lid_h = 0.12f;
            break;

        case 3: // ANGRY - Slanted sharp brow
            tl->width = 29.0f; tl->height = 28.0f; tl->radius = 4.0f;
            tr->width = 29.0f; tr->height = 28.0f; tr->radius = 4.0f;
            tl->top_lid_h = 0.45f; tl->top_lid_angle = -24.0f;
            tr->top_lid_h = 0.45f; tr->top_lid_angle = +24.0f;
            tl->bottom_lid_h = 0.15f; tr->bottom_lid_h = 0.15f;
            break;

        case 4: // UPSET / SUSPICIOUS - Narrowed horizontal squint
            tl->width = 28.0f; tl->height = 20.0f; tl->radius = 5.0f;
            tr->width = 28.0f; tr->height = 20.0f; tr->radius = 5.0f;
            tl->top_lid_h = 0.35f; tr->top_lid_h = 0.35f;
            tl->bottom_lid_h = 0.35f; tr->bottom_lid_h = 0.35f;
            break;

        case 5: // SAD - Drooping puppy eyes
            tl->width = 27.0f; tl->height = 30.0f; tl->radius = 7.0f;
            tr->width = 27.0f; tr->height = 30.0f; tr->radius = 7.0f;
            tl->cy = 34.0f; tr->cy = 34.0f;
            tl->top_lid_h = 0.40f; tl->top_lid_angle = +18.0f;
            tr->top_lid_h = 0.40f; tr->top_lid_angle = -18.0f;
            break;

        case 6: // LOVE - Pulsating hearts
            tl->is_heart = true;
            tr->is_heart = true;
            tl->width = 28.0f; tl->height = 28.0f;
            tr->width = 28.0f; tr->height = 28.0f;
            break;

        case 7: // EXCITED / SURPRISED - Tall, wide bouncy eyes
            tl->width = 31.0f; tl->height = 38.0f; tl->radius = 12.0f;
            tr->width = 31.0f; tr->height = 38.0f; tr->radius = 12.0f;
            break;

        case 8: // CURIOUS - Asymmetric quizzical expression
            tl->width = 29.0f; tl->height = 36.0f; tl->radius = 10.0f;
            tl->cy = 29.0f;
            tr->width = 27.0f; tr->height = 28.0f; tr->radius = 6.0f;
            tr->cy = 33.0f;
            tr->top_lid_h = 0.22f; tr->top_lid_angle = -14.0f;
            break;

        case 9: // THINKING - Inquisitive upward gaze & pondering brow
            tl->width = 28.0f; tl->height = 32.0f; tl->radius = 8.0f;
            tl->cx = 38.0f + 6.0f; tl->cy = 32.0f - 5.0f;
            tr->width = 27.0f; tr->height = 27.0f; tr->radius = 6.0f;
            tr->cx = 90.0f + 6.0f; tr->cy = 32.0f - 5.0f;
            tr->top_lid_h = 0.28f; tr->top_lid_angle = -18.0f;
            break;

        default:
            break;
    }

    // Set cardinal gaze target offsets
    if (look_dir == 1) {       // Look Left
        s_target_gaze_x = -8.5f;
        s_target_gaze_y = 0.0f;
    } else if (look_dir == 2) { // Look Right
        s_target_gaze_x = +8.5f;
        s_target_gaze_y = 0.0f;
    } else {                    // Center
        s_target_gaze_x = 0.0f;
        s_target_gaze_y = 0.0f;
    }
}

/**
 * Advance animation physics, blink state machine, and tweening
 */
static void update_animation_frame(void) {
    // 1. Advance Blink State Machine
    if (s_blink_state == BLINK_IDLE) {
        s_blink_timer_ms -= FRAME_PERIOD_MS;
        if (s_blink_timer_ms <= 0) {
            s_blink_state = BLINK_CLOSING;
            s_blink_phase_ms = 0;
        }
    } else if (s_blink_state == BLINK_CLOSING) {
        s_blink_phase_ms += FRAME_PERIOD_MS;
        s_blink_progress = (float)s_blink_phase_ms / 45.0f;
        if (s_blink_progress >= 1.0f) {
            s_blink_progress = 1.0f;
            s_blink_state = BLINK_CLOSED;
            s_blink_phase_ms = 0;
        }
    } else if (s_blink_state == BLINK_CLOSED) {
        s_blink_phase_ms += FRAME_PERIOD_MS;
        s_blink_progress = 1.0f;
        if (s_blink_phase_ms >= 20) {
            s_blink_state = BLINK_OPENING;
            s_blink_phase_ms = 0;
        }
    } else if (s_blink_state == BLINK_OPENING) {
        s_blink_phase_ms += FRAME_PERIOD_MS;
        s_blink_progress = 1.0f - ((float)s_blink_phase_ms / 75.0f);
        if (s_blink_progress <= 0.0f) {
            s_blink_progress = 0.0f;
            s_blink_state = BLINK_IDLE;
            // 25% chance of realistic double-blink
            if ((rand() % 4) == 0) {
                s_blink_timer_ms = 110;
            } else {
                s_blink_timer_ms = 2200 + (rand() % 3000);
            }
        }
    }

    // 2. Advance Wink Timer
    if (s_wink_active) {
        s_wink_timer_ms -= FRAME_PERIOD_MS;
        if (s_wink_timer_ms <= 0) {
            s_wink_active = false;
        }
    }

    // 3. Autonomous Micro-Saccades (Visual Life)
    if (s_saccade_hold_ms > 0) {
        s_saccade_hold_ms -= FRAME_PERIOD_MS;
        if (s_saccade_hold_ms <= 0) {
            s_saccade_x = 0.0f;
            s_saccade_y = 0.0f;
            s_saccade_timer_ms = 1800 + (rand() % 2400);
        }
    } else {
        s_saccade_timer_ms -= FRAME_PERIOD_MS;
        if (s_saccade_timer_ms <= 0 && s_blink_state == BLINK_IDLE && !s_wink_active) {
            s_saccade_x = (float)((rand() % 5) - 2); // -2 to +2 px
            s_saccade_y = (float)((rand() % 3) - 1); // -1 to +1 px
            s_saccade_hold_ms = 180 + (rand() % 140);
        }
    }

    // 4. Compute Base Targets for Current Emotion
    eye_param_t target_l, target_r;
    compute_mood_targets(s_current_mood, s_current_look_dir, &target_l, &target_r);

    // Heartbeat Pulse for Love Emotion
    if (s_current_mood == 6) {
        s_heartbeat_phase += 0.22f;
        float pulse = 1.0f + 0.14f * fabsf(sinf(s_heartbeat_phase));
        target_l.width *= pulse;
        target_l.height *= pulse;
        target_r.width *= pulse;
        target_r.height *= pulse;
    }

    // Thinking Pondering Pulse
    if (s_current_mood == 9) {
        static float s_thinking_phase = 0.0f;
        s_thinking_phase += 0.08f;
        float breath = 1.5f * sinf(s_thinking_phase);
        target_l.height += breath;
        target_r.height += breath;
    }

    // Smooth Gaze Interpolation
    s_gaze_x = lerp_f(s_gaze_x, s_target_gaze_x, 0.22f);
    s_gaze_y = lerp_f(s_gaze_y, s_target_gaze_y, 0.22f);

    float total_off_x = s_gaze_x + s_saccade_x;
    float total_off_y = s_gaze_y + s_saccade_y;
    target_l.cx += total_off_x;
    target_l.cy += total_off_y;
    target_r.cx += total_off_x;
    target_r.cy += total_off_y;

    // Apply Blink Override
    if (s_blink_state != BLINK_IDLE) {
        target_l.top_lid_h = s_blink_progress;
        target_r.top_lid_h = s_blink_progress;
        target_l.height = lerp_f(target_l.height, 4.0f, s_blink_progress);
        target_r.height = lerp_f(target_r.height, 4.0f, s_blink_progress);
    }

    // Apply Wink Override
    if (s_wink_active) {
        target_l.top_lid_h = 1.0f;
        target_l.height = 4.0f;
        target_r.bottom_lid_h = 0.52f;
        target_r.bottom_lid_angle = -12.0f;
    }

    // 5. Exponential Smoothing (Tweening) to Live State
    float rate = 0.25f;
    s_eye_l.cx = lerp_f(s_eye_l.cx, target_l.cx, rate);
    s_eye_l.cy = lerp_f(s_eye_l.cy, target_l.cy, rate);
    s_eye_l.width = lerp_f(s_eye_l.width, target_l.width, rate);
    s_eye_l.height = lerp_f(s_eye_l.height, target_l.height, rate);
    s_eye_l.radius = lerp_f(s_eye_l.radius, target_l.radius, rate);
    s_eye_l.top_lid_h = lerp_f(s_eye_l.top_lid_h, target_l.top_lid_h, rate);
    s_eye_l.top_lid_angle = lerp_f(s_eye_l.top_lid_angle, target_l.top_lid_angle, rate);
    s_eye_l.bottom_lid_h = lerp_f(s_eye_l.bottom_lid_h, target_l.bottom_lid_h, rate);
    s_eye_l.bottom_lid_angle = lerp_f(s_eye_l.bottom_lid_angle, target_l.bottom_lid_angle, rate);
    s_eye_l.is_heart = target_l.is_heart;

    s_eye_r.cx = lerp_f(s_eye_r.cx, target_r.cx, rate);
    s_eye_r.cy = lerp_f(s_eye_r.cy, target_r.cy, rate);
    s_eye_r.width = lerp_f(s_eye_r.width, target_r.width, rate);
    s_eye_r.height = lerp_f(s_eye_r.height, target_r.height, rate);
    s_eye_r.radius = lerp_f(s_eye_r.radius, target_r.radius, rate);
    s_eye_r.top_lid_h = lerp_f(s_eye_r.top_lid_h, target_r.top_lid_h, rate);
    s_eye_r.top_lid_angle = lerp_f(s_eye_r.top_lid_angle, target_r.top_lid_angle, rate);
    s_eye_r.bottom_lid_h = lerp_f(s_eye_r.bottom_lid_h, target_r.bottom_lid_h, rate);
    s_eye_r.bottom_lid_angle = lerp_f(s_eye_r.bottom_lid_angle, target_r.bottom_lid_angle, rate);
    s_eye_r.is_heart = target_r.is_heart;
}

static void render_current_eyes(void) {
    taskENTER_CRITICAL(&s_oled_mux);
    memset(s_framebuffer, 0, sizeof(s_framebuffer));
    draw_procedural_eye(&s_eye_l);
    draw_procedural_eye(&s_eye_r);
    taskEXIT_CRITICAL(&s_oled_mux);

    ssd1306_render();
}

esp_err_t oled_init(void) {
    ESP_LOGI(TAG, "Initializing I2C master bus (SDA: GPIO %d, SCL: GPIO %d, Speed: %d Hz)...", 
             OLED_I2C_SDA_PIN, OLED_I2C_SCL_PIN, OLED_I2C_FREQ_HZ);

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

    // Initialize default procedural eye geometry
    s_eye_l.cx = 38.0f; s_eye_l.cy = 32.0f; s_eye_l.width = 28.0f; s_eye_l.height = 34.0f; s_eye_l.radius = 9.0f;
    s_eye_r.cx = 90.0f; s_eye_r.cy = 32.0f; s_eye_r.width = 28.0f; s_eye_r.height = 34.0f; s_eye_r.radius = 9.0f;

    s_oled_ready = true;
    oled_clear();
    ESP_LOGI(TAG, "SSD1306 Procedural OLED Driver initialized successfully at 0x%02X!", target_addr);
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

    s_pairing_screen_active = true;

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
    if (code && strlen(code) == 6) {
        snprintf(formatted, sizeof(formatted), "%.3s %.3s", code, code + 3);
    } else if (code) {
        snprintf(formatted, sizeof(formatted), "%s", code);
    } else {
        snprintf(formatted, sizeof(formatted), "------");
    }
    draw_string(22, 26, formatted, 2);

    // Bottom prompt
    draw_string(14, 52, "ENTER IN APP", 1);
    taskEXIT_CRITICAL(&s_oled_mux);

    ssd1306_render();
}

void oled_show_wifi_setup_screen(const char *ap_ssid) {
    if (!s_oled_ready) return;

    s_pairing_screen_active = true;

    taskENTER_CRITICAL(&s_oled_mux);
    memset(s_framebuffer, 0, sizeof(s_framebuffer));

    // Header Title
    draw_string(28, 4, "SETUP WI-FI", 1);

    // Divider Line (y=16, 108px wide)
    for (int x = 10; x < 118; x++) {
        draw_pixel(x, 16, true);
    }

    // Step 1: Connect to Hotspot
    draw_string(8, 22, "1.CONNECT PHONE TO:", 1);

    char ap_buf[32];
    snprintf(ap_buf, sizeof(ap_buf), "%s", ap_ssid ? ap_ssid : "LUMI-SETUP");
    draw_string(8, 34, ap_buf, 1);

    // Step 2: Open Browser
    draw_string(8, 48, "2.OPEN 192.168.4.1", 1);
    taskEXIT_CRITICAL(&s_oled_mux);

    ssd1306_render();
}

void oled_draw_eyes(int mood, int lookDir) {
    if (mood < 0) mood = 0;
    if (mood > 8) mood = 8;
    if (lookDir < 0) lookDir = 0;
    if (lookDir > 2) lookDir = 2;

    s_current_mood = mood;
    s_current_look_dir = lookDir;
    s_pairing_screen_active = false;

    // If not paired yet, render once directly on boot
    if (!s_is_paired && s_oled_ready) {
        eye_param_t tl, tr;
        compute_mood_targets(mood, lookDir, &tl, &tr);
        s_eye_l = tl;
        s_eye_r = tr;
        render_current_eyes();
    }
}

void oled_draw_blink(void) {
    s_blink_state = BLINK_CLOSING;
    s_blink_phase_ms = 0;
}

void oled_draw_wink(void) {
    s_wink_active = true;
    s_wink_timer_ms = 600; // Hold wink for 600ms then reopen
}

void oled_set_emotion_by_name(const char *name) {
    if (!name) return;
    if (strcmp(name, "happy") == 0)        s_current_mood = 0;
    else if (strcmp(name, "excited") == 0) s_current_mood = 7;
    else if (strcmp(name, "surprised") == 0) s_current_mood = 7;
    else if (strcmp(name, "curious") == 0) s_current_mood = 8;
    else if (strcmp(name, "neutral") == 0) s_current_mood = 1;
    else if (strcmp(name, "sleep") == 0)   s_current_mood = 2;
    else if (strcmp(name, "sleepy") == 0)  s_current_mood = 2;
    else if (strcmp(name, "angry") == 0)   s_current_mood = 3;
    else if (strcmp(name, "upset") == 0)   s_current_mood = 4;
    else if (strcmp(name, "sad") == 0)     s_current_mood = 5;
    else if (strcmp(name, "love") == 0)    s_current_mood = 6;
    else if (strcmp(name, "thinking") == 0) s_current_mood = 9;
    else if (strcmp(name, "wink") == 0) {
        oled_draw_wink();
        return;
    }

    if (!s_is_paired && s_oled_ready) {
        oled_draw_eyes(s_current_mood, s_current_look_dir);
    }
}

void oled_set_gaze_offset(float x_ratio, float y_ratio) {
    if (x_ratio < -1.0f) x_ratio = -1.0f;
    if (x_ratio > 1.0f) x_ratio = 1.0f;
    if (y_ratio < -1.0f) y_ratio = -1.0f;
    if (y_ratio > 1.0f) y_ratio = 1.0f;

    s_target_gaze_x = x_ratio * 10.0f;
    s_target_gaze_y = y_ratio * 7.0f;
}

void oled_set_paired(bool paired) {
    s_is_paired = paired;
    if (paired) {
        s_pairing_screen_active = false;
        oled_draw_eyes(s_current_mood, s_current_look_dir);
    }
}

static void oled_animation_task_func(void *pvParameters) {
    TickType_t last_wake_time = xTaskGetTickCount();
    const TickType_t period_ticks = pdMS_TO_TICKS(FRAME_PERIOD_MS);

    while (1) {
        if (s_oled_ready && s_is_paired && !s_pairing_screen_active) {
            update_animation_frame();
            render_current_eyes();
        } else {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        vTaskDelayUntil(&last_wake_time, period_ticks);
    }
}

void oled_start_animation_task(void) {
    // Pin animation task to Core 1 so Core 0 handles network/LiveKit
    xTaskCreatePinnedToCore(oled_animation_task_func, "oled_anim_task", 4096, NULL, 3, NULL, 1);
}
