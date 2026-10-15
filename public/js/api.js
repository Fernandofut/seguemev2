// ============================================================
// 🌐 Segue-me V2 — Cliente de API do Frontend (Etapa 6)
// Gerencia o JWT no localStorage e injeta o header
// `Authorization: Bearer <token>` em todas as requisições fetch.
// Incluído por todas as páginas ANTES do script da própria página
// (script clássico: as funções abaixo ficam disponíveis globalmente).
// ============================================================

const TOKEN_KEY = 'segueme_token';
const USUARIO_KEY = 'segueme_usuario';

// ------------------------------------------------------------
// Sessão (JWT + dados públicos do usuário)
// ------------------------------------------------------------
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** Salva o token JWT (e, opcionalmente, os dados públicos do usuário). */
function salvarSessao(token, usuario) {
  localStorage.setItem(TOKEN_KEY, token);
  if (usuario) {
    localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
  }
}

function getUsuarioSalvo() {
  try {
    return JSON.parse(localStorage.getItem(USUARIO_KEY));
  } catch {
    return null;
  }
}

function limparSessao() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
}

/**
 * Decodifica o PAYLOAD do JWT (sem validar a assinatura).
 * ⚠️ Uso EXCLUSIVAMENTE para roteamento visual (ex.: admin → painel).
 * A segurança real (o que pode ou não ser acessado) é aplicada sempre
 * no backend, via verificarToken + isAdmin.
 */
function decodificarPayloadJWT(token) {
  try {
    const parte = String(token).split('.')[1];
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Perfil do usuário logado: prioriza o cache; fallback no payload do JWT. */
function getRole() {
  const usuario = getUsuarioSalvo();
  if (usuario && usuario.role) return usuario.role;
  const token = getToken();
  if (!token) return null;
  return decodificarPayloadJWT(token)?.role ?? null;
}

/** Página inicial conforme o perfil: admin → painel; demais → ficha. */
function destinoPorRole(role) {
  return role === 'admin' ? '/admin.html' : '/formulario.html';
}

// ------------------------------------------------------------
// Fetch com Authorization: Bearer <token>
// ------------------------------------------------------------
async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

function apiGet(url) {
  return apiFetch(url);
}

function apiPost(url, corpo) {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

/**
 * Encerra a sessão quando o backend responde 401 (token ausente/
 * inválido/expirado) ou 403 (perfil sem permissão naquela página):
 * limpa o storage e devolve o usuário ao login.
 */
function tratarFalhaSessao() {
  limparSessao();
  window.location.replace('/index.html');
}

// ------------------------------------------------------------
// Utilitários compartilhados
// ------------------------------------------------------------
/** Escapa texto para injeção segura via innerHTML (evita XSS). */
function esc(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Retorna '—' quando o valor é vazio/ausente. */
function ouTraco(valor) {
  const v = valor === null || valor === undefined ? '' : String(valor).trim();
  return v === '' ? '—' : esc(v);
}