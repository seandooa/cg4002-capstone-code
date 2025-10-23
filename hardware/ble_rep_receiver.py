import asyncio
import platform
import json
import os

from bleak import BleakClient, BleakScanner

# UUIDs must match the ESP32 sketch
DEVICE_NAME = "ESP32 Fitness Tracker"
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

def clear_console():
    """Clears the console screen."""
    command = 'cls' if platform.system().lower() == 'windows' else 'clear'
    os.system(command)

def notification_handler(sender: int, data: bytearray):
    """Handles incoming data from the BLE characteristic."""
    message = data.decode('utf-8')
    try:
        # Parse the JSON string
        sensor_data = json.loads(message)
        
        # Clear the console for a clean display
        clear_console()

        # Display the formatted data
        print("--- ESP32 Fitness Tracker ---")
        
        mode = sensor_data.get('mode', 'N/A')
        print(f"               Mode: {mode}")
        
        hr = sensor_data.get('hr', 0)
        if hr > 0:
            print(f"         Heart Rate: {hr} BPM")
        else:
            print("         Heart Rate: (No finger detected)")
            
        # Only show reps or "get ready" message in exercise modes
        if mode != "HR Only":
            # Check if the 'start' flag is true
            if sensor_data.get('start', False):
                print(f"               Reps: {sensor_data.get('reps', 'N/A')}")
            else:
                # If 'start' is false, it's the "get ready" period
                print("\n             >> Get Ready! <<")

        print("-----------------------------")
        
        # --- MODIFIED ---
        # Print raw JSON for debugging
        print(f"Raw JSON: {message}")


    except json.JSONDecodeError:
        print(f"Could not decode JSON: {message}")
    except Exception as e:
        print(f"An error occurred: {e}")


async def main():
    """Main function to scan, connect, and listen for notifications."""
    print("Scanning for devices...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME)

    if device is None:
        print(f"Could not find a device named '{DEVICE_NAME}'")
        return

    print(f"Found device: {device.name} ({device.address})")

    async with BleakClient(device) as client:
        if client.is_connected:
            print(f"Connected to {device.name}")
            
            # Subscribe to notifications from the characteristic
            await client.start_notify(CHARACTERISTIC_UUID, notification_handler)
            print("Subscribed to notifications. Waiting for data...")
            
            # Keep the script running to receive notifications
            while client.is_connected:
                await asyncio.sleep(1)
        else:
            print(f"Failed to connect to {device.name}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nProgram stopped by user.")