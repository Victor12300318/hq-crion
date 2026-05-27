import { NextResponse } from "next/server";
import {
  createSessionToken,
  getNextLoginFailureState,
  getSessionCookieName,
  isUserBlocked,
  MissingSessionSecretError,
  normalizeEmail,
  sessionCookieOptions,
  validateEmail,
  validateLoginPassword,
  verifyPassword
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseBody(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const body = value as Record<string, unknown>;

  return {
    email: typeof body.email === "string" ? normalizeEmail(body.email) : "",
    senha: typeof body.senha === "string" ? body.senha : ""
  };
}

export async function POST(request: Request) {
  try {
    const body = parseBody(await request.json().catch(() => null));

    if (!body || !validateEmail(body.email) || !validateLoginPassword(body.senha)) {
      return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 });
    }

    const user = await prisma.usuarios.findUnique({
      where: {
        email: body.email
      }
    });

    if (!user || user.deletado_em || !user.ativo) {
      await verifyPassword(body.senha, "pbkdf2_sha256$600000$dummy_salt$dummy_hash_to_prevent_timing_attacks");
      return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 });
    }

    if (isUserBlocked(user.bloqueado_ate)) {
      return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 });
    }

    const validPassword = await verifyPassword(body.senha, user.senha_hash);

    if (!validPassword) {
      await prisma.usuarios.update({
        where: { id: user.id },
        data: getNextLoginFailureState(user.tentativas_login)
      });

      return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 });
    }

    const safeUser = await prisma.usuarios.update({
      where: { id: user.id },
      data: {
        tentativas_login: 0,
        bloqueado_ate: null,
        ultimo_login_em: new Date()
      },
      select: {
        id: true,
        nome: true,
        email: true
      }
    });

    const response = NextResponse.json({ user: safeUser });
    response.cookies.set(getSessionCookieName(), createSessionToken(user.id), sessionCookieOptions);

    return response;
  } catch (error) {
    if (error instanceof MissingSessionSecretError) {
      console.error("Login configuration error: SESSION_SECRET is not configured.");
      return NextResponse.json({ error: "Configuracao de sessao ausente. Defina SESSION_SECRET no .env." }, { status: 500 });
    }

    console.error("Login error:", error);
    return NextResponse.json({ error: "Nao foi possivel fazer login." }, { status: 500 });
  }
}
