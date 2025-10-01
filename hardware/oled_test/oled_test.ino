#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void setup() {
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    for (;;); // Stop if OLED not found
  }

  display.clearDisplay();
  display.setTextSize(2);        // Adjust size
  display.setTextColor(SSD1306_WHITE);

  const char* text = "hehe";
  int16_t x1, y1;
  uint16_t w, h;

  // Get text pixel bounds
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);

  // Center text
  int16_t x = (SCREEN_WIDTH - w) / 2;
  int16_t y = (SCREEN_HEIGHT - h) / 2;

  display.setCursor(x, y);
  display.print(text);
  display.display(); // Show on screen
}

void loop() {
  // Nothing to do here
}
