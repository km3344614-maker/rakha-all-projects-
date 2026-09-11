@echo off 
title Made By R5A 

bcdedit /timeout 7
:: time to display boot options
:: set this to 0 if you have only 1 OS
:: Made By R5A

bcdedit /deletevalue useplatformclock
:: forcing it to off makes mousegraphs unstable, 
:: even tho wintimertester shows the same QueryPerfFreq as deleted

bcdedit /set debug No
:: Disables kernel debugger

:: bcdedit /set isolatedcontext No
:: This setting is used to differentiate between the Windows 7 and Windows 8 implementations of UEFI. The element data format is BcdBooleanElement.
:: Do not modify this setting. If this setting is removed from a Windows 8 installation, it will not boot. If this setting is added to a Windows 7 installation, it will not boot.
:: This value is supported starting in Windows 8 and Windows Server 2012.

:: bcdedit /set pae ForceDisable
:: bcdedit /set pae ForceEnable
:: I dunno if this is beneficial or not, so just not using it
:: When PAE is enabled, the system loads the PAE version of the Windows kernel
:: It defines a page table hierarchy of three levels (instead of two), with table entries of 64 bits each instead of 32, allowing these CPUs to directly access a physical address space larger than 4 gigabytes (232 bytes).

bcdedit /deletevalue usefirmwarepcisettings
:: bcdedit /set usefirmwarepcisettings no
:: If set to yes, checks PCI LOCK in msconfig. Not recommended to apply (keep it default)
:: Enables or disables the use of BIOS-configured peripheral component interconnect (PCI) resources
:: Stops Windows from dynamically assigning IO/IRQ resources to PCI devices and leaves the devices configured by the BIOS
:: you might also wanna try yes

:: Don't think it is that necessary 
:: bcdedit /set sos Yes 
:: Controls the display of the names of the drivers as they load during the boot process


bcdedit /set x2apicpolicy disable
:: Enables or disables the use of extended APIC mode
:: bcdedit /set uselegacyapicmode no
:: No need because you already have x2apicpolicy set
:: Forces usage of basic APIC functionality even though the chipset reports extended APIC functionality as present. 
:: Used in cases of hardware errata and/or incompatibility.


:: Dunno if it's good or not (https://www.intel.com/content/dam/doc/specification-update/64-architecture-x2apic-specification.pdf) 
:: bcdedit /set usephysicaldestination No
:: Forces the use of the APIC in physical destination mode

bcdedit /set ems No
:: Emergency Management Services (EMS) provides an RS-232 accessible serial console interface to the bootloader menu on modern versions of Microsoft Windows
:: EMS allows users to control particular components of a server remotely, even when the server is not connected to the network or to other standard remote-administration tools

:: bcdedit /set firstmegabytepolicy UseAll
:: Indicates how the first megabyte of memory is to be used
:: FirstMegabytePolicyUseNone (0) Use none of the first megabyte of memory.
:: FirstMegabytePolicyUseAll (1) Use all of the first megabyte of memory.
:: FirstMegabytePolicyUsePrivate (2) Reserved for future use.

:: This is already defaulted
:: bcdedit /set configaccesspolicy Default 
:: Indicates the access policy for PCI configuration space. The element data format is BcdIntegerElement. The following are the possible values.
:: ConfigAccessPolicyDefault (0)
:: Access to PCI configuration space through the memory-mapped region is allowed.
:: ConfigAccessPolicyDisallowMmConfig (1)
:: Access to PCI configuration space through the memory-mapped region is not allowed. 
:: This setting is used for platforms that implement memory-mapped configuration space incorrectly. 
:: The CFC/CF8 access mechanism can be used to access configuration space on these platforms.

:: Device if u want to use it (https://en.m.wikipedia.org/wiki/Intel_5-level_paging) 
:: bcdedit /set linearaddress57 optin
:: Intel 5-level paging, useful only for Intel 10th gen and above
:: It extends the size of virtual addresses from 48 bits to 57 bits, increasing the addressable virtual memory from 256 TiB to 128 PiB.

:: This should be already default in OS (source windows documentation https://docs.microsoft.com/en-us/windows-hardware/drivers/devtest/bcdedit--dbgsettings)
:: bcdedit /set noumex Yes 
:: Specifies that the kernel debugger ignores user-mode exceptions. 
:: By default, the kernel debugger breaks for certain user-mode exceptions, such as STATUS_BREAKPOINT and STATUS_SINGLE_STEP. 
:: The /noumex parameter is effective only when there is no user-mode debugger attached to the process.

bcdedit /set bootems No 
:: Emergency Management Services (EMS) provides an RS-232 accessible serial console interface to the bootloader menu on modern versions of Microsoft Windows
:: EMS allows users to control particular components of a server remotely, even when the server is not connected to the network or to other standard remote-administration tools

:: Why would u ever need to use this? LOOOOL (Defaulted in windows) 
:: bcdedit /set graphicsmodedisabled No
:: Indicates whether graphics mode is disabled and boot applications must use text mode display

:: Same as above || bcdedit /set highestmode Yes
:: Forces highest available graphics resolution at boot. This value can only be used on UEFI systems.
:: This value is supported starting in Windows 8 and Windows Server 2012

:: bcdedit /set extendedinput Yes
:: Also is kinda not needed
:: Enables boot applications to leverage BIOS support for extended console input.

bcdedit /set perfmem 0 
:: Size of the buffer to allocate for performance data logging. 
:: This option acts similarly to the removememory element, since it prevents Windows from seeing the size specified as available memory.

:: Dunno if u should use this too 
:: bcdedit /set clustermodeaddressing 1 
:: Defines the maximum number of processors to include in a single Advanced Programmable Interrupt Controller (APIC) cluster.

bcdedit /set configflags 0 
:: Specifies processor-specific configuration flags.

:: also useless like really LOOOOOOL
:: bcdedit /set onecpu No 
:: Causes Windows to use only one CPU on a multiprocessor system

:: bcdedit /set halbreakpoint No 
:: If you set this to yes, you will bsod
:: Causes the HAL to stop at a breakpoint early in HAL initialization. 
:: The first thing the Windows kernel does when it initializes is to initialize the HAL, so this breakpoint is the earliest one possible (unless boot debugging is used). 
:: If the switch is used without the /DEBUG switch, the system will elicit a blue screen with a STOP code of 0x00000078 (PHASE0_ EXCEPTION).

:: Also seems useless
:: bcdedit /set forcelegacyplatform No 
:: Forces the OS to assume the presence of legacy PC devices like CMOS and keyboard controllers


:: !!! NEW !!!


bcdedit /set integrityservices disable
:: Enables or disables code integrity services, which are used by Kernel Mode Code Signing. Default is Enabled.
:: If I get it right, there will be no need to type nointegritychecks if this is set. Disabling services is better than just not letting them run.

:: Thought it might be better for someone 
::bcdedit /set traditionalksegmappings no
:: Determines whether the kernel will honor the traditional KSEG0 mapping that was originally required for MIPS support. 
:: With KSEG0 mappings, the bottom 24 bits of the kernel s initial virtual address space will map to the same physical address (that is, 0x80800000 virtual is 0x800000 in RAM).
:: !!! Disabling this requirement allows more low memory to be available, which can help with some hardware.

bcdedit /set bootux Disabled
:: Defines the boot graphics user experience that the user will see. Disabled means that no graphics will be seen during boot time (only a black screen)

bcdedit /set hypervisorlaunchtype Off
:: Enables loading of the hypervisor on a Hyper-V system, or forces it to be disabled.

bcdedit /set nx AlwaysOff
:: Disables Data Execution Prevention || is a security feature, DEP is intended to prevent an application or service from executing code from a non-executable memory region
:: In short, DEP perform additional checks on memory to prevent malicious code or exploits from running on the system by shut down the process once detected

bcdedit /set tpmbootentropy ForceDisable
:: Forces a specific TPM Boot Entropy policy to be selected by the boot loader and passed on to the kernel. 
:: TPM Boot Entropy, when used, seeds the kernel s random number generator (RNG) with data obtained from the TPM (if present)
:: Basically disabled a security feature (source - https://en.wikipedia.org/wiki/Trusted_Platform_Module)

bcdedit /set bootlog no
:: Disables the system initialization log. This log is stored in the Ntbtlog.txt file in the %WINDIR% directory. 
:: It includes a list of loaded and unloaded drivers in text format.

bcdedit /event off
:: Disables remote event logging for the current Windows operating system boot entry
:: Dunno if it's enabled by default, but better make it disabled

bcdedit /bootdebug off
:: Disables boot debug, by default it is enabled.
:: https://docs.microsoft.com/en-us/windows-hardware/drivers/devtest/bcdedit--bootdebug

:: bcdedit /set increaseuserva 268435328
:: Absolutely useless for 64bit systems since virtual address space for processes is the 128-terabyte range (instead of 2gb like on 32bit)
:: https://docs.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/virtual-address-spaces

:: bcdedit /set nolowmem yes
:: Also probably only for 32bit systems. this option loads the operating system, device drivers, 
:: and all applications into addresses above the 4 GB boundary, 
:: and directs Windows to allocate all memory pools at addresses above the 4 GB boundary
:: The option is ignored in Win8 and above

