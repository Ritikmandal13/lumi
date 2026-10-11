idf_component_register(
    SRCS "main.c" "oled.c"
    INCLUDE_DIRS "."
    REQUIRES 
        esp_wifi
        nvs_flash
        esp_event
        esp_netif
        esp_http_client
        esp_http_server
        esp_timer
        json
        esp32-camera
        esp_driver_i2c
        driver
        livekit
        mbedtls
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-deprecated-declarations -Wno-unused-variable)

