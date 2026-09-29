/**
 * API pública de `components/auth/`.
 *
 * `AuthShell` es server-safe: la usan páginas server que necesitan exportar
 * `metadata`. `LoginForm` y `RegisterForm` son client (estado del formulario y
 * `useAuth()`) y llegan a la pantalla como `children` del shell, así que la
 * página sigue siendo un Server Component.
 */
export { AuthShell, type AuthShellProps } from './auth-shell';
export { LoginForm } from './login-form';
export { RegisterForm } from './register-form';
