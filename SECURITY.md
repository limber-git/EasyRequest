# Seguridad

No publiques vulnerabilidades explotables ni credenciales en issues públicos.
Repórtalas mediante la opción **Report a vulnerability** del repositorio:
<https://github.com/limber-git/EasyRequest/security/advisories/new>.

Incluye el impacto, una reproducción mínima y las versiones afectadas. No
incluyas tokens reales, cookies, contraseñas ni información personal.

## Datos locales

Las variables marcadas como secreto se guardan mediante VS Code
`SecretStorage`. Los valores escritos directamente en headers, URLs o bodies
siguen formando parte del archivo `.erequest`; usa referencias a variables
secretas para credenciales.
