from pynq import allocate, Overlay
import numpy as np
import time
import struct
import logging 

logger = logging.getLogger("nn_inference")
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s",
                              datefmt="%Y-%m-%d %H:%M:%S")
ch.setFormatter(formatter)
logger.addHandler(ch)

logger.info("Loading Overlay")
overlay = Overlay("nn.bit")
logger.info("Loaded Overlay")

logger.info(f'Overlay components: ')
nn = overlay.nn_inference_0
print(f'NN block: {nn}')
dma = overlay.axi_dma_0
print(f'DMA block: {dma}')
print()

logger.info("Setting auto restart register in NN block")
nn.register_map.CTRL.AUTO_RESTART = 1
nn.register_map.CTRL.AP_START = 1
logger.info(f'Status of restart register: {nn.register_map.CTRL.AUTO_RESTART}')

logger.info("allocating buffers")
input_buffer = allocate(shape=(52,), dtype=np.float32)
output_buffer = allocate(shape=(1,), dtype=np.float32)

def inference(data, actual):
    print()
    if (nn.register_map.CTRL.AP_START):
        logger.info(f'Status of AP_START: {nn.register_map.CTRL.AP_START}, nn block is ready')
    logger.info("writing to buffer")
    input_buffer[:] = np.array(data, dtype=np.float32)

    logger.info("sending data")
    dma.sendchannel.transfer(input_buffer)
    dma.recvchannel.transfer(output_buffer)
    dma.sendchannel.wait()
    logger.info("waiting for results")
    dma.recvchannel.wait()
    correct_float = output_buffer[0]
    logger.info(f'inference complete, result: {correct_float}, expected result: {actual}')
    return correct_float

test1 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 331, 211, 0, 359, 225, 0, 336, 300, 0, 0, 0, 0, 317, 382, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
test2 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 331, 211, 0, 359, 225, 0, 336, 300, 0, 0, 0, 0, 317, 382, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
test3 = [0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000, 236.3430, 227.8461,   0.9992, 357.6490, 229.4881,   0.9993, 152.2962, 229.5417,   0.9853, 427.4297, 243.2412,   0.9803, 118.7597, 201.3928,   0.8289, 455.6027, 233.0195,   0.7954, 270.2129, 384.7458,   0.9998, 349.6024, 385.7790,   0.9998,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   0.0000,   2.0000]

tlist = [(test1, 1), (test2, 1), (test3, 0)]

start_time = time.time()
rlist = []
for test, actual in tlist:
    rlist.append(inference(test, actual))

#print(f'Inference time: {((time.time() - start_time) * 1000):.4f} ms')
#print(f'Predicted value: {rlist}')