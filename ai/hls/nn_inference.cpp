#include <hls_stream.h> //streaming interface
#include <math.h>
#include <hls_math.h>
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


inline float sigmoid(data_t x) {
    #pragma HLS INLINE
    if (x > 10) x = 10;
    if (x < -10) x = -10;
   
    data_t temp = 1 / (1 + hls::exp(-x));


    if (temp < 0.5 ) return 0.0;
    return 1.0;
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
   f_int FIUnion;
   float curr;

   for (int i = 0; i < INPUT_SIZE; i++) {
       pkt = in_stream.read();
       FIUnion.int_version = pkt.data;
       curr = FIUnion.ft_version;
       input[i] = (data_t)curr;
   }

   //first linear layer
   data_t hidden1[H1];
   linear_layer<H1, INPUT_SIZE>(linear1_w, linear1_b, input, hidden1);

   for (int i = 0; i < H1; i++) {
       #pragma HLS PIPELINE II=1
       hidden1[i] = leaky_relu(hidden1[i]);
   }

   data_t hidden2[H2];
   linear_layer<H2, H1>(linear2_w, linear2_b, hidden1, hidden2);

   for (int i = 0; i < H2; i++) {
       #pragma HLS PIPELINE II=1
       hidden2[i] = leaky_relu(hidden2[i]);
   }

   // Second linear layer
   data_t result[OUTPUT_SIZE];
   linear_layer<OUTPUT_SIZE, H2>(linear3_w, linear3_b, hidden2, result);
   FIUnion.ft_version = sigmoid(result[0]);
   pkt.data = FIUnion.int_version;
   pkt.last = 1;
   pkt.strb = 0xf;
   pkt.keep = 0xf;
   out_stream.write(pkt);
}
