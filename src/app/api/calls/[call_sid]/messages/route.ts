import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ call_sid: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { call_sid } = await params;
    const messages = await prisma.chamadas_mensagens.findMany({
      where: {
        call_sid: call_sid
      },
      orderBy: {
        time_in_call_secs: 'asc'
      }
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
