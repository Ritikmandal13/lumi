idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES 
        esp_wifi
        nvs_flash
        esp_event
        esp_netif
        esp_http_client
        esp_timer
        json
        esp32-camera
        driver
)
