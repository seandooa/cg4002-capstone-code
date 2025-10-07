#include <hls_stream.h> //streaming interface
#include <math.h>
#include "nn_inference.h"

//inline behaviour has to be specified since HLS inline is off by default
inline data_t leaky_relu(data_t x) {
   #pragma HLS INLINE
   if (x > 0) {
       return x;
   }
   const data_t slope = 0.01;
   return slope * x;
}

inline data_t sigmoid(data_t x) {
    #pragma HLS INLINE
    if (x > 10) x = 10;
    if (x < -10) x = -10;
    
    data_t exp_x = hls::exp(x);
    return exp_x / (1 + exp_x);
}

//row by row calculations in pytorch as opposed to row by col in matrix
template<int OUT_SIZE, int IN_SIZE>
void linear_layer( const data_t W[OUT_SIZE][IN_SIZE], const data_t b[OUT_SIZE], const data_t in[IN_SIZE], data_t out[OUT_SIZE] ) {
       for (int o = 0; o < OUT_SIZE; o++) {
           #pragma HLS PIPELINE II=1 //syn.compile.pipeline_loops is set to 64 by default
           data_t acc = b[o];
           for (int i = 0; i < IN_SIZE; i++) {
               acc += W[o][i] * in[i];
           }
           out[o] = acc;
       }
}

// Top HLS function
extern "C" void nn_inference(hls::stream<trans_pkt> &in_stream, hls::stream<trans_pkt> &out_stream) {
   #pragma HLS INTERFACE s_axilite port=return //control register
   #pragma HLS INTERFACE axis port=in_stream
   #pragma HLS INTERFACE axis port=out_stream //should be a ap_ovld, so I will need to check the control signal and data signal

   // Convert float input to fixed-point
   data_t input[INPUT_SIZE];
   trans_pkt pkt;
   for (int i = 0; i < INPUT_SIZE; i++) {
       pkt = in_stream.read();
       input[i] = (data_t)pkt.data;
   }

   //first linear layer
   data_t hidden[HIDDEN_SIZE];
   linear_layer<HIDDEN_SIZE, INPUT_SIZE>(linear1_w, linear1_b, input, hidden);


   for (int i = 0; i < HIDDEN_SIZE; i++) {
       #pragma HLS PIPELINE II=1
       hidden[i] = leaky_relu(hidden[i]);
   }

   // Second linear layer
   data_t output[OUTPUT_SIZE];
   linear_layer<OUTPUT_SIZE, HIDDEN_SIZE>(linear2_w, linear2_b, hidden, output);
    pkt.data = output[0];
    pkt.last = 1; //to complete the AXI stream transaction
    pkt.strb = 0xf;
    pkt.keep = 0xf;
    out_stream.write(pkt);
}