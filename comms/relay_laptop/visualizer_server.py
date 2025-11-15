import struct
import asyncio
import json
import time
import socket
import websockets
import requests
import re
from websockets.server import WebSocketServerProtocol

class FitnessRelayServer:
    def __init__(self):
        self.connections = {}  # hdl -> device_id
        self.device_connections = {}  # device_id -> hdl
        self.device_index = {}  # index -> device_id (for easy command access)
        self.device_counter = 0  # Counter for device indices
        self.local_ip = self.get_local_ip()
        
        # Track workout state for dynamic metrics
        self.device_workout_state = {}  # device_id -> {start_time, rep_count, is_active, base_heart_rate}
        
        # Track last valid AI data
        self.last_ai_data = None
    
    def get_local_ip(self):
        """Get the local IP address of this machine, preferring WiFi/WLAN adapters"""
        try:
            import subprocess
            import re
            
            # Try to get all network interfaces on Windows
            result = subprocess.run(['ipconfig'], capture_output=True, text=True)
            output = result.stdout
            
            # Look for WLAN adapter first (WiFi has priority)
            wlan_section = re.search(r'Wireless LAN adapter Wi-Fi:.*?IPv4 Address.*?: ([\d.]+)', output, re.DOTALL | re.IGNORECASE)
            if wlan_section:
                ip = wlan_section.group(1)
                print(f"✓ Found WiFi IP: {ip}")
                return ip
            
            # Fallback: Look for any Ethernet adapter (but avoid Hyper-V, WSL, VirtualBox, VMware)
            ethernet_pattern = r'Ethernet adapter (?!vEthernet|VirtualBox|VMware).*?:.*?IPv4 Address.*?: ([\d.]+)'
            ethernet_match = re.search(ethernet_pattern, output, re.DOTALL | re.IGNORECASE)
            if ethernet_match:
                ip = ethernet_match.group(1)
                print(f"✓ Found Ethernet IP: {ip}")
                return ip
            
            # Fallback: Use socket method (but this might give wrong adapter)
            print("⚠️  Using socket fallback method...")
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            
            # Reject common virtual adapter IPs
            if local_ip.startswith('172.') or local_ip.startswith('169.254.'):
                print(f"⚠️  Detected virtual/APIPA IP: {local_ip}, may not be correct")
            
            return local_ip
        except Exception as e:
            print(f"❌ Warning: Could not detect local IP: {e}")
            return "127.0.0.1"

    def fetch_ngrok_data(self):
        """
        Fetch data from ngrok site and parse it.
        Format: A,B,C,D,E,F
        A = exercise type (1,2,3,4)
        B = heart rate
        C = reps
        D = start flag (0,1)
        E = valid_check (0,1) - indicates if AI data is valid
        F = AI data (0 or 1) - only valid when valid_check is 1
        Returns dict with parsed values or None if error
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'ngrok-skip-browser-warning': 'true'
            }
            response = requests.get("http://10.190.16.103:8081/", headers=headers, timeout=500)
            html = response.text
            
            # Extract data from h1 tag
            match = re.search(r"<h1>(.*?)</h1>", html)
            if not match:
                print("No <h1> tag found in the HTML response")
                return None
            
            h1_content = match.group(1)
            # Split comma-separated values
            data_values = [value.strip() for value in h1_content.split(',')]
            
            if len(data_values) < 6:
                print(f"⚠️  Expected at least 6 values, got {len(data_values)}")
                return None
            
            # Parse data according to format: A,B,C,D,E,F
            valid_check = int(data_values[4])  # E - valid_check (0 or 1)
            ai_data = 1
            
            # Only parse AI data if valid_check is 1
            if valid_check == 1:
                ai_data = int(data_values[5])  # F - AI data (0 or 1)
            
            parsed_data = {
                'exercise': int(data_values[0]),      # A
                'heart_rate': int(data_values[1]),    # B
                'reps': int(data_values[2]),           # C
                'start_flag': int(data_values[3]),     # D
                'valid_check': valid_check,            # E - valid_check
                'ai_data': ai_data                      # F - AI data (None if not valid)
            }
            
            return parsed_data
            
        except Exception as e:
            print(f"Error fetching data from ngrok site: {e}")
            return None

    async def on_connect(self, websocket: WebSocketServerProtocol):
        print("New client connected")
        self.connections[websocket] = "unknown"

    async def on_disconnect(self, websocket: WebSocketServerProtocol):
        print("Client disconnected")
        device_id = self.connections.pop(websocket, "unknown")
        if device_id != "unknown":
            self.device_connections.pop(device_id, None)
            # Remove from index
            for idx, dev_id in list(self.device_index.items()):
                if dev_id == device_id:
                    del self.device_index[idx]
                    break
            print(f"Device {device_id} disconnected")

    async def handle_message(self, websocket: WebSocketServerProtocol, message: str):
        try:
            data = json.loads(message)
            message_type = data.get("type", "")
            device_id = data.get("deviceId", "")
            #print(f"Received {message_type} from device {device_id}")

            if message_type == "device_register":
                await self.handle_device_registration(websocket, data)
            elif message_type == "biometric_data":
                await self.handle_biometric_data(websocket, data)
            elif message_type == "pose_data":
                await self.handle_pose_data(websocket, data)
            elif message_type == "rep_detection":
                await self.handle_rep_detection(websocket, data)
            else:
                print(f"Unknown message type: {message_type}")
        except Exception as e:
            print(f"Error processing message: {e}")

    async def handle_device_registration(self, websocket, data):
        device_id = data.get("deviceId", "")
        exercise_type = data.get("exerciseType", "")
        if device_id:
            self.connections[websocket] = device_id
            self.device_connections[device_id] = websocket
            # Assign index to device
            self.device_counter += 1
            self.device_index[self.device_counter] = device_id
            print(f"Device registered: {device_id} (Exercise: {exercise_type}) [Index: {self.device_counter}]")

    async def handle_biometric_data(self, websocket, data):
        biometric_data = data.get("data", {})
        heart_rate = biometric_data.get("heartRate", 0)
        rep_count = biometric_data.get("repCount", 0)
        exercise_type = biometric_data.get("exerciseType", "")

    async def handle_pose_data(self, websocket, data):
        pose_data = data.get("data", {})
        exercise_type = pose_data.get("exerciseType", "")
        await asyncio.sleep(0.05)
    
    async def handle_rep_detection(self, websocket, data):
        rep_data = data.get("data", {})
        rep_count = rep_data.get("repCount", 0)
        exercise_type = rep_data.get("exerciseType", "")
        print(f"Rep detected: {rep_count} for {exercise_type}")
    
    async def send_ai_feedback(self, feedback):
        device_id = self.resolve_device_id(1)
        if device_id == None:
            return
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                try:
                    response = {
                        "type": "ai_feedback",
                        "payload": {
                            "timestamp": int(time.time() * 1000),
                            "feedback": feedback # 
                        }
                    }
                    await websocket.send(json.dumps(response))
                except Exception as e:
                    print(f"Error sending AI feedback: {e}")

    # ============================================================================
    # WORKOUT CONTROL COMMANDS - For testing and control
    # ============================================================================
    
    async def send_system_command(self, websocket, action, **kwargs):
        """Send a system command to a device"""
        try:
            command = {
                "type": "system_command",
                "payload": {
                    "action": action,
                    **kwargs
                }
            }
            await websocket.send(json.dumps(command))
            print(f"✓ Sent command: {action} {kwargs}")
        except Exception as e:
            print(f"Error sending system command: {e}")
    
    def resolve_device_id(self, identifier):
        """Resolve device identifier (can be index, device_id, or 'all')"""
        if identifier == "all":
            return "all"
        
        # Try as index number
        try:
            index = int(identifier)
            if index in self.device_index:
                return self.device_index[index]
            else:
                print(f"❌ Device index {index} not found. Use 'list' to see devices.")
                return None
        except ValueError:
            # Not a number, treat as device_id
            if identifier in self.device_connections:
                return identifier
            else:
                print(f"❌ Device {identifier} not found. Use 'list' to see devices.")
                return None
    
    async def select_exercise(self, device_identifier, exercise_type):
        """Select an exercise for a device or all devices"""
        device_id = self.resolve_device_id(device_identifier)
        if device_id is None:
            return
            
        if device_id == "all":
            for dev_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    await self.send_system_command(websocket, "select_exercise", exerciseType=exercise_type)
            print(f"📋 Sent to ALL: Select exercise '{exercise_type}'")
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                await self.send_system_command(websocket, "select_exercise", exerciseType=exercise_type)
                print(f"📋 Sent to device: Select exercise '{exercise_type}'")
            else:
                print(f"❌ Device not found or not connected")
    
    async def start_workout(self, device_identifier):
        """Start workout for a device or all devices"""
        device_id = self.resolve_device_id(device_identifier)
        if device_id is None:
            return
            
        if device_id == "all":
            for dev_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    await self.send_system_command(websocket, "start_workout")
                    # Activate workout state for dynamic metrics
                    if dev_id in self.device_workout_state:
                        self.device_workout_state[dev_id]['is_active'] = True
                        self.device_workout_state[dev_id]['start_time'] = time.time()
                        self.device_workout_state[dev_id]['rep_count'] = 0
            print(f"▶️  Sent to ALL: Start workout (metrics now active)")
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                await self.send_system_command(websocket, "start_workout")
                # Activate workout state for dynamic metrics
                if device_id in self.device_workout_state:
                    self.device_workout_state[device_id]['is_active'] = True
                    self.device_workout_state[device_id]['start_time'] = time.time()
                    self.device_workout_state[device_id]['rep_count'] = 0
                print(f"▶️  Sent to device: Start workout (metrics now active)")
            else:
                print(f"❌ Device not found or not connected")
    
    async def stop_workout(self, device_identifier):
        """Stop workout for a device or all devices"""
        device_id = self.resolve_device_id(device_identifier)
        if device_id is None:
            return
            
        if device_id == "all":
            for dev_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    await self.send_system_command(websocket, "stop_workout")
                    # Deactivate workout state
                    if dev_id in self.device_workout_state:
                        self.device_workout_state[dev_id]['is_active'] = False
                        final_reps = self.device_workout_state[dev_id]['rep_count']
                        final_duration = int(time.time() - self.device_workout_state[dev_id]['start_time'])
                        print(f"   📊 Final stats for {dev_id[:8]}... → Reps: {final_reps}, Duration: {final_duration}s")
            print(f"⏹️  Sent to ALL: Stop workout (metrics now passive)")
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                await self.send_system_command(websocket, "stop_workout")
                # Deactivate workout state
                if device_id in self.device_workout_state:
                    self.device_workout_state[device_id]['is_active'] = False
                    final_reps = self.device_workout_state[device_id]['rep_count']
                    final_duration = int(time.time() - self.device_workout_state[device_id]['start_time'])
                    print(f"   📊 Final stats → Reps: {final_reps}, Duration: {final_duration}s")
                print(f"⏹️  Sent to device: Stop workout (metrics now passive)")
            else:
                print(f"❌ Device not found or not connected")
    
    def list_devices(self):
        """List all connected devices"""
        if not self.device_connections:
            print("\n📱 No devices connected")
            return []
        
        print("\n" + "=" * 70)
        print("📱 CONNECTED DEVICES")
        print("=" * 70)
        device_list = []
        
        # Create reverse mapping for display
        id_to_index = {device_id: idx for idx, device_id in self.device_index.items()}
        
        for device_id, websocket in self.device_connections.items():
            status = "✓ Online" if websocket.open else "✗ Offline"
            index = id_to_index.get(device_id, "?")
            print(f"  [{index}] {device_id} - {status}")
            device_list.append(device_id)
        print("=" * 70)
        print("💡 Tip: Use the index number [1], [2], etc. in commands")
        print("=" * 70 + "\n")
        return device_list

    async def send_performance_metrics(self, websocket, device_id):
        """Send performance metrics to device - only from ngrok data"""
        try:
            # Get or initialize workout state for this device
            if device_id not in self.device_workout_state:
                self.device_workout_state[device_id] = {
                    'start_time': time.time(),
                    'rep_count': 0,
                    'is_active': False
                }
            
            state = self.device_workout_state[device_id]
            
            # Calculate workout duration
            workout_duration = int(time.time() - state['start_time'])

            # Get data from ngrok site - only send if data is available
            ngrok_data = self.fetch_ngrok_data()
            
            if not ngrok_data:
                # Don't send dummy data - just return
                return
            
            # Use only the data from ngrok site
            heart_rate = ngrok_data['heart_rate']
            rep_count = ngrok_data['reps']
            state['rep_count'] = rep_count
            
            # Pulse is same as heart rate (no random variation)
            pulse = heart_rate
            
            # Calculate calories based on duration and reps
            calories = int(workout_duration * 0.15 + rep_count * 1.2)

            metrics = {
                "heartRate": heart_rate,
                "pulse": pulse,
                "repCount": rep_count,
                "workoutDuration": workout_duration,
                "caloriesBurned": calories,
                "timestamp": int(time.time() * 1000)
            }
            
            message = {
                "type": "performance_metrics",
                "payload": metrics
            }
            await websocket.send(json.dumps(message))
            
        except Exception as e:
            print(f"Error sending metrics: {e}")
    
    async def broadcast_periodic_data(self):
        """Continuously send metrics to connected devices - only from ngrok data"""
        print("📡 Starting continuous data broadcast...")
        while True:
            await asyncio.sleep(1)  # Send data every second
            
            if len(self.device_connections) == 0:
                continue
                
            for device_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    # Send performance metrics - only if ngrok data is available
                    # No dummy/random data will be sent
                    await self.send_performance_metrics(websocket, device_id)
                    
                    # AI feedback is handled in command_loop based on ngrok data
                    # No random feedback generation here

    async def handler(self, websocket, path):
        await self.on_connect(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        finally:
            await self.on_disconnect(websocket)

    async def run(self, port=8080, use_ssl=True, use_ngrok=False):
        if use_ssl and not use_ngrok:
            import ssl
            import pathlib
            
            # SSL certificate paths
            ssl_dir = pathlib.Path(__file__).parent.parent / 'ssl'
            cert_file = ssl_dir / 'cert.pem'
            key_file = ssl_dir / 'key.pem'
            
            if not cert_file.exists() or not key_file.exists():
                print("=" * 60)
                print("ERROR: SSL certificates not found!")
                print("=" * 60)
                print(f"Expected certificates at:")
                print(f"  - {cert_file}")
                print(f"  - {key_file}")
                print("\nPlease generate certificates first:")
                print("  python generate_ssl_certificates.py")
                print("\nOr use ngrok for HTTPS (recommended for Vercel):")
                print("  python visualizer_server.py --ngrok")
                print("=" * 60)
                return
            
            # Create SSL context
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
            
            print("=" * 70)
            print(f"🚀 Fitness Relay Server (WSS - Secure)")
            print("=" * 70)
            print(f"✓ Server started on wss://0.0.0.0:{port}")
            print(f"✓ Using SSL certificates from: {ssl_dir}")
            print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
            print("\n🔗 Connection URL for AR app:")
            print(f"   wss://{self.local_ip}:{port}")
            print("\n💡 Configure AR app with this URL in Relay Settings")
            print("=" * 70)
            print("⏳ Waiting for connections...")
            print("Press Ctrl+C to stop\n")
            
            async with websockets.serve(self.handler, "0.0.0.0", port, ssl=ssl_context):
                asyncio.create_task(self.broadcast_periodic_data())
                await asyncio.Future()  # Run forever
        else:
            # For ngrok mode, we run without SSL (ngrok handles SSL termination)
            if use_ngrok:
                print("=" * 70)
                print(f"🚀 Fitness Relay Server (NGROK MODE - For Vercel HTTPS)")
                print("=" * 70)
                print(f"✓ Server started on ws://0.0.0.0:{port}")
                print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
                print("\n" + "=" * 70)
                print("🌐 NGROK SETUP INSTRUCTIONS:")
                print("=" * 70)
                print("1. Install ngrok: https://ngrok.com/download")
                print("2. In a NEW terminal, run:")
                print(f"   ngrok http {port}")
                print("3. Copy the HTTPS URL from ngrok (e.g., https://abc123.ngrok.io)")
                print("4. Convert to WebSocket URL:")
                print("   - Replace 'https://' with 'wss://'")
                print("   - Example: wss://abc123.ngrok.io")
                print("5. In your Vercel-deployed app:")
                print("   - Go to Relay Settings")
                print("   - Enter the WSS URL in 'Proxy/Tunnel URL' field")
                print("   - Save and connect")
                print("=" * 70)
                print("\n💡 TIP: ngrok provides both HTTP and HTTPS endpoints")
                print("   Use the HTTPS endpoint and convert to WSS for secure connections")
                print("=" * 70)
                print("\n⏳ Waiting for connections...")
                print("   (Start ngrok in another terminal to enable external access)")
                print("Press Ctrl+C to stop\n")
            else:
                print("=" * 70)
                print(f"🚀 Fitness Relay Server (WS - Non-Secure)")
                print("=" * 70)
                print(f"✓ Server started on ws://0.0.0.0:{port}")
                print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
                print("\n🔗 Connection URL for AR app:")
                print(f"   ws://{self.local_ip}:{port}")
                print("\n💡 Configure AR app with this URL in Relay Settings")
                print("\n🌐 For Vercel HTTPS deployment, use --ngrok flag:")
                print("   python visualizer_server.py --ngrok")
                print("=" * 70)
                print("⏳ Waiting for connections...")
                print("Press Ctrl+C to stop\n")
            
            async with websockets.serve(self.handler, "0.0.0.0", port):
                asyncio.create_task(self.broadcast_periodic_data())
                await asyncio.Future()  # Run forever

async def run_server_with_commands(server, port, use_ssl, use_ngrok=False):
    import threading
    
    # Get the event loop
    loop = asyncio.get_event_loop()
    
    # Start server in background
    server_task = asyncio.create_task(server.run(port, use_ssl, use_ngrok))
    
    # Wait a bit for server to start
    await asyncio.sleep(2)
    
    # Command loop
    def command_loop(event_loop):
        prev_exercise = None  # Use None to trigger initial send
        prev_start_flag = None  # Use None to trigger initial check
        server_unavailable_warning_shown = False
        device_connected_warning_shown = False
        
        while True:
            try:
                # Wait until at least one device is connected before sending commands
                if len(server.device_connections) == 0:
                    if not device_connected_warning_shown:
                        print("⏳ Waiting for device connection before sending commands...")
                        device_connected_warning_shown = True
                    time.sleep(1)  # Check every second for device connection
                    continue
                
                # Device is connected - reset warning flag and reset previous values
                if device_connected_warning_shown:
                    print("✓ Device connected! Starting command loop...")
                    device_connected_warning_shown = False
                    # Reset previous values to trigger initial commands
                    prev_exercise = None
                    prev_start_flag = None
                
                # Fetch data from ngrok site
                ngrok_data = server.fetch_ngrok_data()
                
                if not ngrok_data:
                    if not server_unavailable_warning_shown:
                        print(f"⚠️  Ngrok site not available - command loop will retry")
                        server_unavailable_warning_shown = True
                    time.sleep(0.5)
                    continue
                
                # Reset warning flag if connection succeeds
                if server_unavailable_warning_shown:
                    print("✓ Site connection restored")
                    server_unavailable_warning_shown = False
                
                # Extract values from parsed data
                exercise = ngrok_data['exercise']      # A
                start_flag = ngrok_data['start_flag']   # D (0 or 1)
                valid_check = ngrok_data['valid_check']  # E - valid_check (0 or 1)
                ai_data = ngrok_data['ai_data']         # F - AI data (None if not valid)
                
                # Convert start_flag from int (0/1) to boolean
                start_flag_bool = bool(start_flag)
                
                # Print parsed data
                ai_data_str = ai_data if ai_data is not None else "N/A (not valid)"
                print(f"Parsed data - Exercise: {exercise}, Heart Rate: {ngrok_data['heart_rate']}, "
                      f"Reps: {ngrok_data['reps']}, Start Flag: {start_flag}, Valid Check: {valid_check}, AI Data: {ai_data_str}")
                
                # Handle exercise change (including initial send) - ALWAYS map to string
                if exercise != prev_exercise:
                    prev_exercise = exercise
                    # Map exercise number to exercise string
                    exercise_string = ''
                    if exercise == 1:
                        exercise_string = 'Hr Only'
                    elif exercise == 2:
                        exercise_string = 'lateral-raises'
                    elif exercise == 3:
                        exercise_string = 'squats'
                    elif exercise == 4:
                        exercise_string = 'bicep-curls'
                    else:
                        exercise_string = 'Hr Only'  # Default fallback
                    
                    print(f"📋 Exercise set to: {exercise_string} (from value: {exercise})")
                    asyncio.run_coroutine_threadsafe(
                        server.select_exercise(1, exercise_string),
                        event_loop
                    )
                
                # Handle workout start/stop (properly mapped)
                # start_flag = 0 means stop, start_flag = 1 means start
                if start_flag_bool != prev_start_flag:
                    if start_flag == 1:  # startFlag is 1 -> Start workout
                        print("▶️  Workout started (startFlag=1)")
                        asyncio.run_coroutine_threadsafe(
                            server.start_workout(1),
                            event_loop
                        )
                    elif start_flag == 0:  # startFlag is 0 -> Stop workout
                        print("⏹️  Workout stopped (startFlag=0)")
                        asyncio.run_coroutine_threadsafe(
                            server.stop_workout(1),
                            event_loop
                        )
                    prev_start_flag = start_flag_bool
                
                # Handle AI feedback
                exercise_string = ''
                if exercise == 1:
                    exercise_string = 'Hr Only'
                elif exercise == 2:
                    exercise_string = 'lateral-raises'
                elif exercise == 3:
                    exercise_string = 'squats'
                elif exercise == 4:
                    exercise_string = 'bicep-curls'
                
                if valid_check == 1 and ai_data in (0, 1):
                    feedback_msg = "Good Form" if ai_data == 1 else "Bad Form"
                    server.last_ai_data = ai_data  # Update last valid data
                    asyncio.run_coroutine_threadsafe(
                        server.send_ai_feedback(feedback_msg),
                        event_loop
                    )
                elif server.last_ai_data is not None:
                    # Use previous valid data when valid_check==0
                    feedback_msg = "Good Form" if server.last_ai_data == 1 else "Bad Form"
                    asyncio.run_coroutine_threadsafe(
                        server.send_ai_feedback(feedback_msg),
                        event_loop
                    )
                else:
                    # No previous data, send Error
                    asyncio.run_coroutine_threadsafe(
                        server.send_ai_feedback("Error"),
                        event_loop
                    )
            except Exception as e:
                print(f"Error in command loop: {e}")
            
            time.sleep(0.5)  # Poll every 0.5 seconds (reduced from 0.1s)
    # Run command loop in a separate thread
    cmd_thread = threading.Thread(target=command_loop, args=(loop,), daemon=True)
    cmd_thread.start()
    
    # Wait for server task
    await server_task

if __name__ == "__main__":
    import sys
    port = 8080
    use_ssl = True  # Use SSL by default
    use_ngrok = False  # Use ngrok for Vercel HTTPS connections
    
    # Parse command line arguments
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)
        elif arg == '--no-ssl':
            use_ssl = False
        elif arg == '--ssl':
            use_ssl = True
        elif arg == '--ngrok':
            use_ngrok = True
            use_ssl = False  # ngrok handles SSL termination
        elif arg in ['--help', '-h']:
            print("\nUsage: python visualizer_server.py [PORT] [OPTIONS]")
            print("\nOptions:")
            print("  PORT        Port number (default: 8080)")
            print("  --ssl       Enable SSL/WSS (default)")
            print("  --no-ssl    Disable SSL, use plain WS")
            print("  --ngrok     Use ngrok mode (for Vercel HTTPS deployment)")
            print("              Server runs without SSL, ngrok handles HTTPS/WSS")
            print("\nExamples:")
            print("  python visualizer_server.py              # Run on port 8080 with SSL")
            print("  python visualizer_server.py 9000         # Run on port 9000 with SSL")
            print("  python visualizer_server.py --no-ssl     # Run on port 8080 without SSL")
            print("  python visualizer_server.py --ngrok      # Run for Vercel deployment")
            print("  python visualizer_server.py 9000 --ngrok # Run on port 9000 with ngrok")
            print("\nFor Vercel HTTPS Deployment:")
            print("  1. Run: python visualizer_server.py --ngrok")
            print("  2. In another terminal: ngrok http 8080")
            print("  3. Copy the HTTPS URL from ngrok and convert to WSS")
            print("  4. Use that WSS URL in Vercel app's Relay Settings\n")
            exit(0)
    
    server = FitnessRelayServer()
    try:
        asyncio.run(run_server_with_commands(server, port, use_ssl, use_ngrok))
    except KeyboardInterrupt:
        print("\nServer stopped.")
