# Windows Credential Manager get/set/delete for a single generic credential.
# Used by antigravity-launcher.mjs to swap the shared `gemini:antigravity`
# login in and out per profile, so each profile carries its own account even
# though Antigravity stores auth in the machine-wide credential store.
#
# Usage:
#   agy-cred.ps1 -Verb read   -Target <t>                 -> prints JSON {found,blob,userName,persist,type} or {found:false}
#   agy-cred.ps1 -Verb write  -Target <t> -Data <base64>  [-UserName u] [-Persist n] [-Type n]
#   agy-cred.ps1 -Verb delete -Target <t>
# Exit 0 on success (read always 0 if it ran), non-zero on API failure.

param(
    [Parameter(Mandatory=$true)][ValidateSet('read','write','delete')][string]$Verb,
    [Parameter(Mandatory=$true)][string]$Target,
    [string]$Data = '',
    [string]$UserName = '',
    [int]$Persist = 2,   # CRED_PERSIST_LOCAL_MACHINE
    [int]$Type = 1       # CRED_TYPE_GENERIC
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace Win32 -Name Cred -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
}
[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);
[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool CredDeleteW(string target, uint type, uint flags);
[DllImport("advapi32.dll", SetLastError=true)]
public static extern void CredFree(IntPtr cred);
'@

function Read-Cred {
    $ptr = [IntPtr]::Zero
    $ok = [Win32.Cred]::CredReadW($Target, [uint32]$Type, 0, [ref]$ptr)
    if (-not $ok) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($err -eq 1168) { return @{ found = $false } }   # ERROR_NOT_FOUND
        throw "CredRead failed: $err"
    }
    try {
        $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][Win32.Cred+CREDENTIAL])
        $bytes = New-Object byte[] $c.CredentialBlobSize
        if ($c.CredentialBlobSize -gt 0) {
            [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $c.CredentialBlobSize)
        }
        $user = ''
        if ($c.UserName -ne [IntPtr]::Zero) {
            $user = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.UserName)
        }
        return @{
            found    = $true
            blob     = [Convert]::ToBase64String($bytes)
            userName = $user
            persist  = [int]$c.Persist
            type     = [int]$c.Type
        }
    } finally { [Win32.Cred]::CredFree($ptr) }
}

function Write-Cred {
    $bytes = [Convert]::FromBase64String($Data)
    $blobPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    $targetPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($Target)
    $userPtr = if ($UserName) { [Runtime.InteropServices.Marshal]::StringToHGlobalUni($UserName) } else { [IntPtr]::Zero }
    try {
        [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blobPtr, $bytes.Length)
        $c = New-Object Win32.Cred+CREDENTIAL
        $c.Type = [uint32]$Type
        $c.TargetName = $targetPtr
        $c.CredentialBlobSize = [uint32]$bytes.Length
        $c.CredentialBlob = $blobPtr
        $c.Persist = [uint32]$Persist
        $c.UserName = $userPtr
        $ok = [Win32.Cred]::CredWriteW([ref]$c, 0)
        if (-not $ok) { throw "CredWrite failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
    } finally {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPtr)
        [Runtime.InteropServices.Marshal]::FreeHGlobal($targetPtr)
        if ($userPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($userPtr) }
    }
}

function Delete-Cred {
    $ok = [Win32.Cred]::CredDeleteW($Target, [uint32]$Type, 0)
    if (-not $ok) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($err -ne 1168) { throw "CredDelete failed: $err" }   # tolerate NOT_FOUND
    }
}

switch ($Verb) {
    'read'   { Read-Cred | ConvertTo-Json -Compress }
    'write'  { Write-Cred;  Write-Output '{"ok":true}' }
    'delete' { Delete-Cred; Write-Output '{"ok":true}' }
}
