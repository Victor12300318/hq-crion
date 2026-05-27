import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const agentParam = searchParams.get('agent');

    const baseFilter: Prisma.chamadasWhereInput = {};

    if (startDateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateParam)) {
        return NextResponse.json({ error: 'Invalid startDate filter' }, { status: 400 });
      }
      const [sYear, sMonth, sDay] = startDateParam.split('-').map(Number);
      const startOfPeriod = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);

      let endOfPeriod: Date;
      if (endDateParam) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateParam)) {
          return NextResponse.json({ error: 'Invalid endDate filter' }, { status: 400 });
        }
        const [eYear, eMonth, eDay] = endDateParam.split('-').map(Number);
        endOfPeriod = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
      } else {
        // Se nao houver data final, trata como filtro de dia unico
        endOfPeriod = new Date(sYear, sMonth - 1, sDay, 23, 59, 59, 999);
      }

      if (Number.isNaN(startOfPeriod.getTime()) || Number.isNaN(endOfPeriod.getTime())) {
        return NextResponse.json({ error: 'Invalid date filter values' }, { status: 400 });
      }

      baseFilter.start_time = {
        gte: startOfPeriod,
        lte: endOfPeriod
      };
    }

    if (agentParam) {
      const agents = agentParam.split(',').filter(Boolean);
      if (agents.length > 0) {
        baseFilter.agent_name = { in: agents };
      }
    }

    const [
      totalCalls,
      callsData,
      agentsListRaw
    ] = await Promise.all([
      prisma.chamadas.count({ where: baseFilter }),
      prisma.chamadas.findMany({
        where: baseFilter,
        orderBy: {
          start_time: 'desc'
        },
        include: {
          dados_extraidos: true,
          auditoria_qa: true
        }
      }),
      prisma.chamadas.groupBy({
        by: ['agent_name'],
        where: {
          agent_name: {
            not: null
          }
        }
      })
    ]);

    let countTransferidos = 0;
    let countResolvidas = 0;
    let countSaudacao = 0;
    let countPalavras = 0;
    let countValidacao = 0;
    let countEmail = 0;
    let countRegras = 0;
    let totalQaCount = 0;
    let sumNotas = 0;
    let countNotas = 0;
    let sumDurationSecs = 0;
    let countDurationSecs = 0;

    const chartReasonsRaw: Record<string, number> = {};

    callsData.forEach((call) => {
      if (call.duration_secs !== null && call.duration_secs !== undefined) {
        sumDurationSecs += call.duration_secs;
        countDurationSecs++;
      }

      const qa = call.auditoria_qa;
      if (qa) {
        totalQaCount++;

        if (qa.transferiu_para_humano === true) countTransferidos++;
        if (qa.transferiu_para_humano === false) countResolvidas++;
        if (qa.saudacao_correta === true) countSaudacao++;
        if (qa.evitou_palavras_proibidas === true) countPalavras++;
        if (qa.fez_validacao_seguranca === true) countValidacao++;
        if (qa.confirmou_email_antes_envio === true) countEmail++;
        if (qa.respeitou_regras_transferencia === true) countRegras++;

        if (qa.nota_atendimento !== null && qa.nota_atendimento !== undefined) {
          sumNotas += Number(qa.nota_atendimento);
          countNotas++;
        }

        const reasonName = qa.motivo_contato ? qa.motivo_contato.trim() : 'Nao Identificado';
        chartReasonsRaw[reasonName] = (chartReasonsRaw[reasonName] || 0) + 1;
      }
    });

    const avgDuration = countDurationSecs > 0 ? sumDurationSecs / countDurationSecs : 0;
    const tmaMinutes = Math.floor(avgDuration / 60);
    const tmaSeconds = Math.round(avgDuration % 60);
    const tmaFormatted = `${tmaMinutes.toString().padStart(2, '0')}:${tmaSeconds.toString().padStart(2, '0')}`;

    const totalQa = totalQaCount || 1;
    const taxaTransferencia = ((countTransferidos / totalQa) * 100).toFixed(1);
    const taxaResolvidas = ((countResolvidas / totalQa) * 100).toFixed(1);

    const chartPerformance = [
      { name: 'Saudacao', value: ((countSaudacao / totalQa) * 100) || 0 },
      { name: 'Palavras Proibidas', value: ((countPalavras / totalQa) * 100) || 0 },
      { name: 'Validacao de Seguranca', value: ((countValidacao / totalQa) * 100) || 0 },
      { name: 'Confirmacao de Email', value: ((countEmail / totalQa) * 100) || 0 },
      { name: 'Regras de Transferencia', value: ((countRegras / totalQa) * 100) || 0 }
    ].map((item) => ({ name: item.name, value: parseFloat(item.value.toFixed(1)) }));

    const chartReasons = Object.entries(chartReasonsRaw)
      .map(([name, value]) => ({ name, value }))
      .filter((reason) => reason.value > 0)
      .sort((a, b) => b.value - a.value);

    const agentsList = agentsListRaw
      .map((agent) => agent.agent_name)
      .filter((agent): agent is string => Boolean(agent));

    const mappedCalls = callsData.map((call) => ({
      call_sid: call.call_sid,
      conversation_id: call.conversation_id,
      start_time: call.start_time,
      user_phone: call.user_phone,
      agent_name: call.agent_name,
      motivo_contato: call.dados_extraidos?.motivo_contato || call.auditoria_qa?.motivo_contato || 'N/A',
      nota_qa: call.auditoria_qa?.nota_atendimento || call.dados_extraidos?.nota_atendimento || null,
      status: call.status,
      summary: call.summary,
      cpf: call.dados_extraidos?.cpf || call.auditoria_qa?.cpf_identificado,
      nome: call.auditoria_qa?.nome_cliente,
      justificativa_nota: call.auditoria_qa?.justificativa_nota,
      sugestoes: call.auditoria_qa?.sugestoes || null,
      transferido: call.auditoria_qa?.transferiu_para_humano || false
    }));

    return NextResponse.json({
      agentsList,
      kpis: {
        totalCalls,
        qaAverage: countNotas > 0 ? (sumNotas / countNotas).toFixed(1) : '0.0',
        transferRate: taxaTransferencia,
        transferCount: countTransferidos,
        resolvedRate: taxaResolvidas,
        resolvedCount: countResolvidas,
        tma: tmaFormatted
      },
      charts: {
        reasons: chartReasons,
        performance: chartPerformance
      },
      latestCalls: mappedCalls
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
