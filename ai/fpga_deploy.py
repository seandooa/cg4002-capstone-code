from pynq import allocate, Overlay
import numpy as np
import time
import struct

start_load = time.time()

overlay = Overlay("nn.bit")
nn = overlay.nn_inference_0
dma = overlay.axi_dma_0

print(f"Loading time: {(time.time() - start_load):.4f} s")
input_buffer = allocate(shape=(52,), dtype=np.float32)
output_buffer = allocate(shape=(1,), dtype=np.float32)

def inference(data):
    nn.write(0x00, 0x1)
    input_buffer[:] = np.array(data, dtype=np.float32)
    dma.sendchannel.transfer(input_buffer)
    dma.recvchannel.transfer(output_buffer)
    dma.sendchannel.wait()
    dma.recvchannel.wait()
    bits = struct.unpack('<I', struct.pack('<f', output_buffer[0]))[0]
    correct_float = struct.unpack('<f', struct.pack('<I', bits))[0]
    return correct_float

test1 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 331, 211, 0, 359, 225, 0, 336, 300, 0, 0, 0, 0, 317, 382, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
test2 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 331, 211, 0, 359, 225, 0, 336, 300, 0, 0, 0, 0, 317, 382, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
test3 = [0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000, 236.3430, 227.8461,   0.9992, 357.6490, 229.4881,   0.9993, 152.2962, 229.5417,   0.9853, 427.4297, 243.2412,   0.9803, 118.7597, 201.3928,   0.8289, 455.6027, 233.0195,   0.7954, 270.2129, 384.7458,   0.9998, 349.6024, 385.7790,   0.9998,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   2.0000]

tlist = [test1, test2, test3]

start_time = time.time()
rlist = []
for test in tlist:
    rlist.append(inference(test))
    print("done")

print(f'Inference time: {((time.time() - start_time) * 1000):.4f} ms')
print(f'Predicted value: {rlist}')