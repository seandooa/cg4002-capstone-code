from pynq import allocate, Overlay
import numpy as np

def inference(data: list):
    input_buffer[:] = np.array(data, dtype=np.float32)

    dma.sendchannel.transfer(input_buffer)
    dma.recvchannel.transfer(output_buffer)
    dma.sendchannel.wait()
    dma.recvchannel.wait()
    correct_float = output_buffer[0]
    return correct_float

if __name__ == 'main':
    print("loading bitstream")
    overlay = Overlay("nn.bit")
    nn = overlay.nn_inference_0
    dma = overlay.axi_dma_0

    print("setting auto restart and allocating buffers")
    nn.register_map.CTRL.AUTO_RESTART = 1
    nn.register_map.CTRL.AP_START = 1

    input_buffer = allocate(shape=(52,), dtype=np.float32)
    output_buffer = allocate(shape=(1,), dtype=np.float32)
    #inference(data)

