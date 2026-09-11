
#pragma once
#include "skStr.h"

#ifndef RXor
#define RXor(s) (skCrypt(s).decrypt())
#endif

#ifndef XOR
#define XOR(s) skCrypt(s).decrypt()
#endif
