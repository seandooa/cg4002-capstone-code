from pynq import allocate, Overlay
import numpy as np
import struct
import socket
import time

print("loading bitstream")
overlay = Overlay("nn.bit")
nn = overlay.nn_inference_0
dma = overlay.axi_dma_0

print("setting auto restart and allocating buffers")
nn.register_map.CTRL.AUTO_RESTART = 1
nn.register_map.CTRL.AP_START = 1

input_buffer = allocate(shape=(59,), dtype=np.float32)
output_buffer = allocate(shape=(1,), dtype=np.float32)

def inference(data: list):
    input_buffer[:] = np.array(data, dtype=np.float32)
    dma.sendchannel.transfer(input_buffer)
    dma.recvchannel.transfer(output_buffer)
    dma.sendchannel.wait()
    dma.recvchannel.wait()
    correct_float = output_buffer[0]
    return correct_float

def unpack_59_floats(data: bytes):
    print(len(data))
    return list(struct.unpack('<' + 'f' * 59, data))

def main():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 2001))
    s.listen()
    print("Listening on localhost:2001")
    while (True):
        conn, addr = s.accept()
        data = conn.recv(236)
        result = unpack_59_floats(data)
        print("INPUT:", result)
        start = time.time()
        prediction = inference(result)
        print(time.time()-start)
        print("PREDICTION:", prediction)
        bytes_sent = conn.send(prediction)
        print("REPLIED:", bytes_sent, "bytes")

if __name__ == "__main__":
    main()
