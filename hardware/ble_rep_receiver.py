# Python script to receive exercise rep data from the ESP32 via BLE.
#
# This script uses the 'bleak' library to scan for, connect to, and receive
# notifications from the ESP32 Rep Counter.
#
# How to use:
# 1.  Make sure the ESP32 is running the corresponding BLE firmware.
# 2.  Install the bleak library:
#     pip install bleak
# 3.  Run this script from your terminal:
#     python ble_rep_receiver.py
# 4.  The script will scan for the ESP32, connect, and print the data
#     as it is received.
# 5.  Press Ctrl+C to stop the script.
#
# @author Gemini
# @version 1.0

import asyncio
from bleak import BleakScanner, BleakClient

# --- Configuration ---
# These values must match the UUIDs defined in your ESP32 code.
DEVICE_NAME = "RepCounterESP32"
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

def notification_handler(sender, data):
    """Callback function to handle incoming data from BLE notifications."""
    try:
        message = data.decode('utf-8')
        # The message is expected in the format "Exercise Name,RepCount"
        exercise, reps = message.split(',')
        print(f"Exercise: {exercise.strip()}, Reps: {reps.strip()}")
    except Exception as e:
        print(f"Could not parse message: {data} | Error: {e}")

async def main():
    """Main function to scan, connect, and listen for notifications."""
    print("Scanning for BLE devices...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME)

    if device is None:
        print(f"Error: Could not find device with name '{DEVICE_NAME}'.")
        print("Please make sure the ESP32 is powered on and running the correct code.")
        return

    print(f"Found device: {device.name} ({device.address})")
    print("Connecting...")

    async with BleakClient(device) as client:
        if client.is_connected:
            print(f"Successfully connected to {DEVICE_NAME}")
            
            # Subscribe to notifications from the characteristic
            await client.start_notify(CHARACTERISTIC_UUID, notification_handler)
            
            print("\nSubscribed to notifications. Waiting for data...")
            print("Perform an exercise to see the rep count update.")
            print("Press Ctrl+C to exit.")
            
            # Keep the script alive to receive notifications
            while client.is_connected:
                await asyncio.sleep(1)
        else:
            print(f"Failed to connect to {DEVICE_NAME}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nProgram stopped by user.")
    except Exception as e:
        print(f"An error occurred: {e}")
