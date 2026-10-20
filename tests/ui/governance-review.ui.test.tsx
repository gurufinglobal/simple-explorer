// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import GovernancePage from '@/app/(explorer)/governance/page';
import GovernanceProposalPage from '@/app/(explorer)/governance/[proposalId]/page';
import { DashboardView } from '@/components/network/dashboard-view';
import { mockQueryHttp } from '../helpers/query-http';
import { mockNetworkSummaryHttp, restoreHttpBoundary } from '../helpers/network-summary';

function showDetail(proposalId = '7') {
  return render(<PathParamsContext.Provider value={{ proposalId }}><GovernanceProposalPage /></PathParamsContext.Provider>);
}
afterEach(() => { cleanup(); restoreHttpBoundary(); });
const legacy = { proposal_id: '7', content: { title: 'Legacy title', description: 'Legacy summary' }, status: 'PROPOSAL_STATUS_VOTING_PERIOD' };
function governanceHttp(votes: unknown[] = [], deposits: unknown[] = []) {
  return mockQueryHttp(url => {
    const path = url.pathname;
    if (path.includes('/v1/')) return new Response('', { status: 404 });
    if (path.endsWith('/proposals')) return { proposals: [legacy] };
    if (path.endsWith('/votes')) return { votes };
    if (path.endsWith('/deposits')) return { deposits };
    if (path.endsWith('/tally')) return { tally: { yes: '1', no: '0', abstain: '0', no_with_veto: '0' } };
    if (path.endsWith('/voting')) return { voting_params: { voting_period: '120h' } };
    if (path.endsWith('/tallying')) return { tally_params: { quorum: '0.33', threshold: '0.5', veto_threshold: '0.334' } };
    if (path.endsWith('/deposit')) return { deposit_params: { min_deposit: [] } };
    if (path.endsWith('/proposals/7')) return { proposal: legacy };
    throw new Error(`Unexpected URL: ${url}`);
  });
}
it('renders the legacy list link and its matching detail with original content', async () => {
  governanceHttp();
  const list = render(<GovernancePage />);
  const link = await screen.findByRole('link', { name: /Legacy title/ });
  expect(link.getAttribute('href')).toBe('/governance/7');
  const proposalId = link.getAttribute('href')!.split('/').at(-1)!;
  list.unmount();
  showDetail(proposalId);
  expect(await screen.findByText('제안 #7')).toBeTruthy();
  expect(screen.getByText('Legacy title')).toBeTruthy();
  expect(screen.getByText('Legacy summary')).toBeTruthy();
});
it.each(['empty', 'malformed', 'mixed'] as const)('renders %s votes/deposits with independent errors and rows', async mode => {
  const votes = mode === 'empty' ? [] : mode === 'malformed' ? [{}] : [{ vote: { voter: 'guru1voter', option: 'VOTE_OPTION_YES' } }, {}];
  const deposits = mode === 'empty' ? [] : mode === 'malformed' ? [{}] : [{ deposit: { depositor: 'guru1depositor', amount: [{ amount: '12', denom: 'agxn' }] } }, {}];
  governanceHttp(votes, deposits);
  showDetail();
  await screen.findByText('제안 #7');
  if (mode === 'empty') {
    expect(await screen.findByText('표시할 투표자 레코드가 없습니다.')).toBeTruthy();
    expect(screen.queryByText(/\(schema\)/)).toBeNull();
  } else {
    expect((await screen.findAllByText(/\(schema\)/))).toHaveLength(2);
    expect(screen.queryByText('표시할 투표자 레코드가 없습니다.')).toBeNull();
    expect(screen.getByText(mode === 'mixed' ? 'guru1voter' : '투표 내역 미확인: 조회 상태를 확인하세요.')).toBeTruthy();
    if (mode === 'mixed') expect(screen.getAllByText('일부 조회 실패')).toHaveLength(2);
  }
  fireEvent.click(screen.getByRole('tab', { name: '예치 내역' }));
  if (mode === 'empty') expect(screen.getByText('표시할 예치 레코드가 없습니다.')).toBeTruthy();
  else {
    expect(screen.queryByText('표시할 예치 레코드가 없습니다.')).toBeNull();
    expect(screen.getByText(mode === 'mixed' ? 'guru1depositor' : '예치 내역 미확인: 조회 상태를 확인하세요.')).toBeTruthy();
    if (mode === 'mixed') expect(screen.getByText('12 agxn')).toBeTruthy();
  }
});
it.each(['success', 'failure'] as const)('keeps Dashboard proposals unqueried during loading and summary %s', async outcome => {
  const http = mockNetworkSummaryHttp();
  const respond = http.getMockImplementation()!;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  http.mockImplementation(async (input, init) => {
    await pending;
    if (outcome === 'failure') return new Response('', { status: 500 });
    if (String(input).includes('/validators?')) return Response.json({ validators: [] });
    return respond(input, init);
  });
  render(<DashboardView />);
  const message = '활성 제안은 아직 조회하지 않았습니다. Governance에서 확인하세요.';
  expect(screen.getByText(message)).toBeTruthy();
  await act(async () => release());
  if (outcome === 'success') await screen.findByText('4.20%');
  else await screen.findAllByText('조회 실패');
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.queryByText('No active proposals — open Governance for the full list.')).toBeNull();
  expect(http.mock.calls.some(([url]) => String(url).includes('/proposals'))).toBe(false);
  expect(screen.getByRole('link', { name: 'Governance' }).getAttribute('href')).toBe('/governance');
});
