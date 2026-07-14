/**
 * Constantes de gestión de usuarios (Spec 04).
 */

/**
 * Contraseña por defecto de toda cuenta nueva y valor al que vuelve un
 * «resetear contraseña». Simple y sin depender de SMTP; el admin puede
 * resetearla y (a futuro) se forzará el cambio en el primer login. Aceptable
 * para los datos ficticios de esta etapa.
 */
export const PASSWORD_POR_DEFECTO = "usuarioNuevo"
