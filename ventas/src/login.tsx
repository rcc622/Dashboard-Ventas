import { useState, type FormEvent } from 'react'
import type { Yo } from './types'
import { login } from './data'

// Pantalla de entrada de /ventas (pedido de Randall 4-sep): usuario y contraseña por persona,
// asesores y administradores. La validación real está en app.py; aquí solo se pide y se muestra.
export function Login({ onOk }: { onOk: (yo: Yo) => void }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!usuario.trim() || !password) { setError('Escribe tu usuario y tu contraseña.'); return }
    setEnviando(true); setError(null)
    try { onOk(await login(usuario.trim(), password)) }
    catch (err) { setError(String(err instanceof Error ? err.message : err)) }
    finally { setEnviando(false) }
  }
  return (
    <div className="login-bg">
      <form className="login" onSubmit={enviar} aria-labelledby="login-t">
        <img className="login-logo" src="./logo.png" alt="Kenet Solar" width="202" height="31" />
        <h1 id="login-t">Tablero de ventas</h1>
        <p className="muted">Entra con el usuario que te dio el administrador.</p>
        <label className="fld"><span>Usuario</span><input className="inp" name="usuario" autoComplete="username" autoCapitalize="none" autoFocus value={usuario} onChange={(e) => setUsuario(e.target.value)} /></label>
        <label className="fld"><span>Contraseña</span><input className="inp" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="cfg-msg err" role="alert">{error}</div>}
        <button type="submit" className="btn on" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
