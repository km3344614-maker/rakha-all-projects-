#pragma once

#if defined(RAKHA_USE_VMPROTECT)
#ifndef RAKHA_VMPROTECT_SDK_HEADER
#error Define RAKHA_VMPROTECT_SDK_HEADER to the quoted path of the official VMProtect SDK header
#endif
#include RAKHA_VMPROTECT_SDK_HEADER
#else
#define VMProtectIsProtected() 0
#define VMProtectIsDebuggerPresent(x) 0
#define VMProtectIsVirtualMachinePresent() 0
#define VMProtectIsValidImageCRC() 1
#define VMProtectBeginUltra(x)
#define VMProtectBeginVirtualization(x)
#define VMProtectBeginMutation(x)
#define VMProtectEnd()
#define VMP_STR(s) (s)
#endif
