$cert = New-SelfSignedCertificate -DnsName "localhost", "127.0.0.1" -CertStoreLocation "cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)
$pwd = ConvertTo-SecureString -String "suze" -Force -AsPlainText
$pfxPath = Join-Path $PSScriptRoot "cert.pfx"
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd
Write-Host "Certificate exported to $pfxPath"
