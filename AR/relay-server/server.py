import asyncio
import json
import random
import time
import socket
import websockets
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
        
        self.feedback_templates = {
            "push-ups": [
                "Excellent push-up form!",
                "Keep your body straight",
                "Lower your body more",
                "Keep elbows close to body",
                "Maintain shoulder alignment",
                "Control the movement",
                "Poor form detected - reset position"
            ],
            "bicep-curls": [
                "Perfect curl form!",
                "Keep shoulders stable",
                "Curl the weights up more",
                "Keep elbows at sides",
                "Control the movement",
                "Don't swing the weights",
                "Poor form detected - reset position"
            ],
            "lateral-raises": [
                "Perfect shoulder height!",
                "Keep slight elbow bend",
                "Raise arms to shoulder level",
                "Keep shoulders level",
                "Control the movement",
                "Don't raise too high",
                "Poor form detected - reset position"
            ],
            "squats": [
                "Perfect squat form!",
                "Keep chest up",
                "Lower your body more",
                "Keep knees behind toes",
                "Keep your back straight",
                "Control the movement",
                "Poor form detected - reset position"
            ]
        }
    
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
            await self.send_ai_feedback(websocket, exercise_type, "good", ["Welcome! Ready to start your workout."])

    async def handle_biometric_data(self, websocket, data):
        biometric_data = data.get("data", {})
        heart_rate = biometric_data.get("heartRate", 0)
        rep_count = biometric_data.get("repCount", 0)
        exercise_type = biometric_data.get("exerciseType", "")

        if heart_rate > 150:
            await self.send_ai_feedback(websocket, exercise_type, "warning", ["Heart rate is high - consider taking a break"])
        elif rep_count > 0 and rep_count % 10 == 0:
            await self.send_ai_feedback(websocket, exercise_type, "good", [f"Great progress! {rep_count} reps completed!"])

    async def handle_pose_data(self, websocket, data):
        pose_data = data.get("data", {})
        exercise_type = pose_data.get("exerciseType", "")
        await asyncio.sleep(0.05)
        await self.generate_and_send_feedback(websocket, exercise_type)

    async def handle_rep_detection(self, websocket, data):
        rep_data = data.get("data", {})
        rep_count = rep_data.get("repCount", 0)
        exercise_type = rep_data.get("exerciseType", "")
        print(f"Rep detected: {rep_count} for {exercise_type}")
        if rep_count % 5 == 0:
            await self.send_ai_feedback(websocket, exercise_type, "good", [
                f"Excellent! {rep_count} reps completed!",
                "Keep up the great work!"
            ])

    async def generate_and_send_feedback(self, websocket, exercise_type):
        feedback_index = random.randint(0, 6)
        confidence = random.uniform(0.7, 1.0)
        status = "good"
        if feedback_index >= 4:
            status = "warning"
        if feedback_index >= 6:
            status = "error"

        # Get feedback templates for the exercise type, with fallback
        templates = self.feedback_templates.get(exercise_type, ["Keep up the good work!"])
        
        # Ensure we don't go out of bounds
        if len(templates) == 0:
            templates = ["Keep up the good work!"]
        
        # Use modulo to safely access the template
        safe_index = feedback_index % len(templates)
        feedback_msg = templates[safe_index]
        
        await self.send_ai_feedback(websocket, exercise_type, status, [feedback_msg], confidence)

    async def send_ai_feedback(self, websocket, exercise_type, status, feedback, confidence=0.85):
        try:
            response = {
                "type": "ai_feedback",
                "payload": {
                    "status": status,
                    "confidence": confidence,
                    "exerciseType": exercise_type,
                    "timestamp": int(time.time() * 1000),
                    "feedback": feedback
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
        """Send dynamic performance metrics to device"""
        try:
            import random
            
            # Get or initialize workout state for this device
            if device_id not in self.device_workout_state:
                self.device_workout_state[device_id] = {
                    'start_time': time.time(),
                    'rep_count': 0,
                    'base_heart_rate': random.randint(65, 75),
                    'is_active': False
                }
            
            state = self.device_workout_state[device_id]
            
            # Calculate dynamic workout duration
            workout_duration = int(time.time() - state['start_time'])
            
            # Dynamic heart rate (increases over time if active, rests if not)
            if state['is_active']:
                # Heart rate increases with workout intensity
                intensity = min(workout_duration / 60.0, 1.0)  # Max intensity after 1 min
                heart_rate = int(state['base_heart_rate'] + (60 * intensity) + random.randint(-5, 5))
                heart_rate = min(heart_rate, 180)  # Cap at 180
                
                # Rep count increases periodically (simulate reps)
                if workout_duration % 8 == 0 and random.random() < 0.7:  # Rep every ~8 seconds
                    state['rep_count'] += 1
            else:
                # Resting heart rate
                heart_rate = state['base_heart_rate'] + random.randint(-3, 3)
            
            pulse = heart_rate + random.randint(-2, 2)
            
            # Calculate calories based on duration and reps
            calories = int(workout_duration * 0.15 + state['rep_count'] * 1.2)
            
            metrics = {
                "heartRate": heart_rate,
                "pulse": pulse,
                "repCount": state['rep_count'],
                "workoutDuration": workout_duration,
                "caloriesBurned": calories,
                "timestamp": int(time.time() * 1000)
            }
            
            message = {
                "type": "performance_metrics",
                "payload": metrics
            }
            await websocket.send(json.dumps(message))
            
            # Log periodically (every 30 seconds)
            if workout_duration % 30 == 0:
                print(f"📊 Metrics sent to {device_id[:8]}... → HR: {heart_rate} | Reps: {state['rep_count']} | Duration: {workout_duration}s")
                
        except Exception as e:
            print(f"Error sending metrics: {e}")
    
    async def broadcast_periodic_data(self):
        """Continuously send metrics and feedback to connected devices"""
        print("📡 Starting continuous data broadcast...")
        while True:
            await asyncio.sleep(5)  # Send data every 5 seconds
            
            if len(self.device_connections) == 0:
                continue
                
            for device_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    # Send performance metrics continuously (values change over time)
                    await self.send_performance_metrics(websocket, device_id)
                    
                    # Send AI feedback occasionally (every 10 seconds)
                    if not hasattr(self, '_last_feedback_time'):
                        self._last_feedback_time = {}
                    
                    if device_id not in self._last_feedback_time or \
                       time.time() - self._last_feedback_time[device_id] > 10:
                        exercises = ["push-ups", "bicep-curls", "lateral-raises", "squats"]
                        exercise = random.choice(exercises)
                        await self.generate_and_send_feedback(websocket, exercise)
                        self._last_feedback_time[device_id] = time.time()

    async def handler(self, websocket, path):
        await self.on_connect(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        finally:
            await self.on_disconnect(websocket)

    async def run(self, port=8080, use_ssl=True):
        if use_ssl:
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
            print("=" * 70)
            print(f"🚀 Fitness Relay Server (WS - Non-Secure)")
            print("=" * 70)
            print(f"✓ Server started on ws://0.0.0.0:{port}")
            print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
            print("\n🔗 Connection URL for AR app:")
            print(f"   ws://{self.local_ip}:{port}")
            print("\n💡 Configure AR app with this URL in Relay Settings")
            print("=" * 70)
            print("⏳ Waiting for connections...")
            print("Press Ctrl+C to stop\n")
            async with websockets.serve(self.handler, "0.0.0.0", port):
                asyncio.create_task(self.broadcast_periodic_data())
                await asyncio.Future()  # Run forever

async def run_server_with_commands(server, port, use_ssl):
    """Run server with interactive command interface"""
    import threading
    
    # Get the event loop
    loop = asyncio.get_event_loop()
    
    # Start server in background
    server_task = asyncio.create_task(server.run(port, use_ssl))
    
    # Wait a bit for server to start
    await asyncio.sleep(2)
    
    print("\n" + "=" * 70)
    print("💬 INTERACTIVE COMMAND MODE")
    print("=" * 70)
    print("Available commands:")
    print("  list                          - List all connected devices")
    print("  select <id/all> <exercise>    - Select exercise (use device index, e.g., '1')")
    print("  start <id/all>                - Start workout (use device index, e.g., '1')")
    print("  stop <id/all>                 - Stop workout (use device index, e.g., '1')")
    print("  help                          - Show this help")
    print("  quit                          - Stop server")
    print("\n💡 Tip: Use 'list' to see device indices, then use numbers in commands!")
    print("=" * 70 + "\n")
    
    # Command loop
    def command_loop(event_loop):
        while True:
            try:
                cmd = input("Command> ").strip()
                if not cmd:
                    continue
                    
                parts = cmd.split()
                action = parts[0].lower()
                
                if action == "quit":
                    print("\nStopping server...")
                    event_loop.call_soon_threadsafe(event_loop.stop)
                    break
                elif action == "list":
                    server.list_devices()
                elif action == "select" and len(parts) >= 3:
                    device_id = parts[1]
                    exercise = parts[2]
                    asyncio.run_coroutine_threadsafe(
                        server.select_exercise(device_id, exercise),
                        event_loop
                    )
                elif action == "start" and len(parts) >= 2:
                    device_id = parts[1]
                    asyncio.run_coroutine_threadsafe(
                        server.start_workout(device_id),
                        event_loop
                    )
                elif action == "stop" and len(parts) >= 2:
                    device_id = parts[1]
                    asyncio.run_coroutine_threadsafe(
                        server.stop_workout(device_id),
                        event_loop
                    )
                elif action == "help":
                    print("\nAvailable commands:")
                    print("  list                        - List all connected devices with indices")
                    print("  select <id/all> <exercise>  - Select exercise")
                    print("    Exercises: bicep-curls, lateral-raises, squats, other")
                    print("    <id> can be: device index (1, 2, 3...), 'all', or full device_id")
                    print("  start <id/all>              - Start workout")
                    print("  stop <id/all>               - Stop workout")
                    print("  help                        - Show this help")
                    print("  quit                        - Stop server")
                    print("\nExamples (using device indices):")
                    print("  list")
                    print("  select 1 bicep-curls    # Select for device [1]")
                    print("  select all squats       # Select for all devices")
                    print("  start 1                 # Start for device [1]")
                    print("  start all               # Start for all devices")
                    print("  stop 1                  # Stop for device [1]\n")
                else:
                    print("❌ Invalid command. Type 'help' for available commands.")
            except EOFError:
                break
            except Exception as e:
                print(f"❌ Error: {e}")
    
    # Run command loop in a separate thread
    cmd_thread = threading.Thread(target=command_loop, args=(loop,), daemon=True)
    cmd_thread.start()
    
    # Wait for server task
    await server_task

if __name__ == "__main__":
    import sys
    port = 8080
    use_ssl = True  # Use SSL by default
    
    # Parse command line arguments
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)
        elif arg == '--no-ssl':
            use_ssl = False
        elif arg == '--ssl':
            use_ssl = True
        elif arg in ['--help', '-h']:
            print("\nUsage: python server.py [PORT] [--ssl|--no-ssl]")
            print("\nOptions:")
            print("  PORT        Port number (default: 8080)")
            print("  --ssl       Enable SSL/WSS (default)")
            print("  --no-ssl    Disable SSL, use plain WS")
            print("\nExamples:")
            print("  python server.py              # Run on port 8080 with SSL")
            print("  python server.py 9000         # Run on port 9000 with SSL")
            print("  python server.py --no-ssl     # Run on port 8080 without SSL")
            print("  python server.py 9000 --no-ssl # Run on port 9000 without SSL\n")
            exit(0)
    
    server = FitnessRelayServer()
    try:
        asyncio.run(run_server_with_commands(server, port, use_ssl))
    except KeyboardInterrupt:
        print("\nServer stopped.")
