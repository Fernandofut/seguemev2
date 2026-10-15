// ============================================================
// 🔑 Segue-me V2 — Tela de Login / Registro (Etapa 6)
// Abas "Entrar" | "Criar Conta". No login bem-sucedido o JWT é
// salvo no localStorage e o usuário é redirecionado conforme o
// perfil: admin → admin.html | jovem/tio → formulario.html
// ============================================================

const el = (id) => document.getElementById(id);

// ---------- Alternância de abas ----------
function selecionarAba(aba) {
  const entrar = el('aba-entrar');
  const criar = el('aba-criar');

  const ativaAba = (botao, ativo) => {
    botao.classList.toggle('bg-white', ativo);
    botao.classList.toggle('text-indigo-700', ativo);
    botao.classList.toggle('shadow', ativo);
    botao.classList.toggle('text-slate-500', !ativo);
    botao.classList.toggle('hover:text-slate-700', !ativo);
  };

  const mostrarLogin = aba === 'entrar';
  ativaAba(entrar, mostrarLogin);
  ativaAba(criar, !mostrarLogin);

  el('form-login').classList.toggle('hidden', !mostrarLogin);
  el('form-registro').classList.toggle('hidden', mostrarLogin);
}

el('aba-entrar').addEventListener('click', () => selecionarAba('entrar'));
el('aba-criar').addEventListener('click', () => selecionarAba('criar'));

// ---------- Erros ----------
function mostrarErro(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.classList.remove('hidden');
}

// ------------------------------------------------------------
// ENTRAR — POST /api/auth/login
// ------------------------------------------------------------
el('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const erro = el('login-erro');
  erro.classList.add('hidden');

  const botao = el('btn-login');
  botao.disabled = true;
  botao.textContent = 'Entrando…';

  try {
    const resposta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: el('login-email').value.trim(),
        senha: el('login-senha').value,
      }),
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mostrarErro(erro, dados.erro || 'Falha no login. Verifique suas credenciais.');
      return;
    }

    // ✅ Sucesso: persiste o JWT (e o usuário) e redireciona por perfil
    salvarSessao(dados.token, dados.usuario);
    window.location.replace(destinoPorRole(dados.usuario?.role ?? getRole()));
  } catch {
    mostrarErro(erro, 'Erro de conexão com o servidor. Tente novamente.');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

// ------------------------------------------------------------
// CRIAR CONTA — POST /api/auth/registrar (jovem | tio)
// O backend NÃO retorna token no registro: após o sucesso,
// voltamos à aba "Entrar" com o e-mail já preenchido.
// ------------------------------------------------------------
el('form-registro').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const erro = el('registro-erro');
  const sucesso = el('registro-sucesso');
  erro.classList.add('hidden');
  sucesso.classList.add('hidden');

  const botao = el('btn-registro');
  botao.disabled = true;
  botao.textContent = 'Criando conta…';

  const email = el('reg-email').value.trim();

  try {
    const resposta = await fetch('/api/auth/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        senha: el('reg-senha').value,
        role: el('reg-role').value,
      }),
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mostrarErro(erro, dados.erro || 'Não foi possível criar a conta.');
      return;
    }

    sucesso.textContent = 'Conta criada com sucesso! Faça login para continuar.';
    sucesso.classList.remove('hidden');

    // Volta para "Entrar" com o e-mail preenchido
    selecionarAba('entrar');
    el('login-email').value = email;
    el('login-senha').value = '';
    el('login-senha').focus();
  } catch {
    mostrarErro(erro, 'Erro de conexão com o servidor. Tente novamente.');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Criar minha conta';
  }
});

// ------------------------------------------------------------
// Sessão existente? Redireciona direto (evita login duplicado)
// ------------------------------------------------------------
(function iniciar() {
  const token = getToken();
  if (token) {
    window.location.replace(destinoPorRole(getRole()));
    return;
  }
  selecionarAba('entrar');
})();