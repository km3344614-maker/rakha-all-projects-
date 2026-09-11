#pragma once
#include "VMProtectSDK.h"
#include "skStr.h"
#include <string>
#include <windows.h>

#ifndef VM_START
#define VM_START
#endif
#ifndef VM_END
#define VM_END
#endif
#ifndef MUTATE_START
#define MUTATE_START SHIELD_BEGIN_MUTATION("RakhaAuth.Mutation")
#endif
#ifndef MUTATE_END
#define MUTATE_END SHIELD_END_MUTATION()
#endif
#ifndef CLEAR_START
#define CLEAR_START
#endif
#ifndef CLEAR_END
#define CLEAR_END
#endif

namespace vmp {
    inline int& nest_depth() {
        static thread_local int d = 0;
        return d;
    }
    inline void begin_ultra(const char* name) {
        const bool outermost = nest_depth()++ == 0;
        if (outermost) { VMProtectBeginUltra(name); }
    }
    inline void begin_mut(const char* name) {
        const bool outermost = nest_depth()++ == 0;
        if (outermost) { VMProtectBeginMutation(name); }
    }
    inline void end() {
        int& depth = nest_depth();
        if (depth <= 0) return;
        if (--depth == 0) { VMProtectEnd(); }
    }
    inline bool compromised() {
        return VMProtectIsProtected()
            && (VMProtectIsDebuggerPresent(false) || !VMProtectIsValidImageCRC());
    }
    inline bool crc_ok() {
        return !VMProtectIsProtected() || VMProtectIsValidImageCRC();
    }
    inline unsigned keep_cfg_markers() { return 0; }
    struct UltraScope {
        explicit UltraScope(const char* name) { begin_ultra(name); }
        ~UltraScope() { end(); }
        UltraScope(const UltraScope&) = delete;
        UltraScope& operator=(const UltraScope&) = delete;
    };
    struct MutationScope {
        explicit MutationScope(const char* name) { begin_mut(name); }
        ~MutationScope() { end(); }
        MutationScope(const MutationScope&) = delete;
        MutationScope& operator=(const MutationScope&) = delete;
    };
}

#if defined(_MSC_VER)
#define SHIELD_NOINLINE inline __declspec(noinline)
#else
#define SHIELD_NOINLINE inline __attribute__((noinline))
#endif

#define SHIELD_BEGIN(name) vmp::begin_ultra(name)
#define SHIELD_END() vmp::end()
#define SHIELD_BEGIN_MUTATION(name) vmp::begin_mut(name)
#define SHIELD_END_MUTATION() vmp::end()
