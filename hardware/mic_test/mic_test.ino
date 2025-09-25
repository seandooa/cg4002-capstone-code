#include <driver/i2s.h>

#define I2S_WS 17
#define I2S_SCK 14
#define I2S_SD 4

#define GAIN 0.2
#define THRESHOLD 5000
#define CLIP 10000
#define SMOOTHING 20
#define DOWNSAMPLE 100   // Plot 1 sample every 100

i2s_config_t i2s_config = {
  .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
  .sample_rate = 16000,
  .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
  .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
  .communication_format = I2S_COMM_FORMAT_I2S_MSB,
  .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
  .dma_buf_count = 4,
  .dma_buf_len = 1024,
  .use_apll = false
};

i2s_pin_config_t pin_config = {
  .bck_io_num = I2S_SCK,
  .ws_io_num = I2S_WS,
  .data_out_num = I2S_PIN_NO_CHANGE,
  .data_in_num = I2S_SD
};

int32_t smoothBuffer[SMOOTHING] = {0};
int smoothIndex = 0;
int downsampleCounter = 0;

void setup() {
  Serial.begin(115200);
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  Serial.println("INMP441 Arduino plot test started...");
}

void loop() {
  const int buffer_len = 256;
  int32_t buffer[buffer_len];
  size_t bytes_read;

  i2s_read(I2S_NUM_0, (char*)buffer, sizeof(buffer), &bytes_read, portMAX_DELAY);
  int samples = bytes_read / 4;

  for (int i = 0; i < samples; i++) {
    int32_t sample = buffer[i] >> 8;
    sample = sample * GAIN;

    if (abs(sample) < THRESHOLD) sample = 0;
    if (sample > CLIP) sample = CLIP;
    if (sample < -CLIP) sample = -CLIP;

    // Rolling average
    smoothBuffer[smoothIndex] = sample;
    smoothIndex = (smoothIndex + 1) % SMOOTHING;

    int32_t sum = 0;
    for (int j = 0; j < SMOOTHING; j++) sum += smoothBuffer[j];
    int32_t smoothSample = sum / SMOOTHING;

    // Downsample for plotting
    downsampleCounter++;
    if (downsampleCounter >= DOWNSAMPLE) {
      Serial.println(smoothSample);
      downsampleCounter = 0;
    }
  }
}
