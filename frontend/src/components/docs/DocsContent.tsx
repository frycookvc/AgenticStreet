import { Fragment } from 'react';
import { parseLinks } from '@/utils/parseLinks';
import {
  sections,
  contact,
  type TableRow,
  type SerpentineStep,
  type LifecyclePhase,
  type PhaseDescription,
  type ProtectionCard,
  type ProposalColumn,
  type ContractBox,
  type Satellite,
  type ReferenceRow,
  type FaqItem,
  type CodeBlock,
  type RegistrationStep,
} from '@/content/docs-content';

// ─── Render helpers ───

function renderParagraphs(texts: readonly string[]) {
  return texts.map((text, i) => (
    <p key={i} className="text-[14px] leading-[1.8] text-text-secondary">
      {parseLinks(text)}
    </p>
  ));
}

function renderCodeInline(text: string) {
  // Replace `code` with styled <code> elements
  const parts = text.split(/`([^`]+)`/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="text-primary">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function renderTable(rows: readonly TableRow[], hasHeader?: boolean) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        {hasHeader && (
          <thead>
            <tr className="bg-canvas-surface">
              <th className="border border-border-default px-3 py-2 text-left text-text-primary font-medium">
                Parameter
              </th>
              <th className="border border-border-default px-3 py-2 text-left text-text-primary font-medium">
                Value
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="border border-border-default px-3 py-2 text-text-secondary font-medium">
                {row.key}
              </td>
              <td className="border border-border-default px-3 py-2 text-text-secondary">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderSerpentineDiagram(rows: readonly SerpentineStep[][]) {
  return (
    <div className="border border-border-default p-6 overflow-x-auto">
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-x-3 gap-y-0 items-center min-w-[500px]">
        {rows.map((row, rowIdx) => {
          // Row with 3 items: full serpentine row
          if (row.length === 3) {
            const isReversed = rowIdx === 1;
            const items = isReversed ? [...row].reverse() : row;
            const arrow = isReversed ? '\u2190' : '\u2192';

            return (
              <Fragment key={rowIdx}>
                {rowIdx === 1 && (
                  <>
                    {/* Right-side vertical connector between row 0 and row 1 */}
                    <div />
                    <div />
                    <div />
                    <div />
                    <div className="flex justify-center py-1">
                      <div className="h-8 border-l border-border-default" />
                    </div>
                  </>
                )}
                {items.map((step, i) => (
                  <Fragment key={i}>
                    <div
                      className={`border ${step.highlight ? 'border-primary-border' : 'border-border-default'} px-5 py-4 text-center`}
                    >
                      <p
                        className={`text-[15px] ${step.highlight ? 'font-medium text-primary' : 'text-text-secondary'}`}
                      >
                        {step.text}
                      </p>
                    </div>
                    {i < items.length - 1 && (
                      <span className="text-[15px] text-text-secondary text-center px-1">
                        {arrow}
                      </span>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            );
          }

          // Row with 1 item: final step (left-aligned)
          const step = row[0];
          if (!step) return null;
          return (
            <Fragment key={rowIdx}>
              {/* Left-side vertical connector */}
              <div className="flex justify-center py-1">
                <div className="h-8 border-l border-border-default" />
              </div>
              <div />
              <div />
              <div />
              <div />
              {/* Single item */}
              <div
                className={`border ${step.highlight ? 'border-primary-border' : 'border-border-default'} px-5 py-4 text-center`}
              >
                <p
                  className={`text-[15px] ${step.highlight ? 'font-medium text-primary' : 'text-text-secondary'}`}
                >
                  {step.text}
                </p>
              </div>
              <div />
              <div />
              <div />
              <div />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function renderLifecycleFlow(phases: readonly LifecyclePhase[]) {
  return (
    <div className="border border-border-default p-6 overflow-x-auto">
      <div className="flex flex-wrap items-start gap-3 min-w-[500px] justify-center">
        {phases.map((phase, i) => (
          <Fragment key={phase.name}>
            <div className="border border-border-default px-5 py-4 text-center min-w-[120px]">
              <p className="text-[15px] font-medium uppercase tracking-wider text-text-secondary">
                {phase.name}
              </p>
              <p className="text-[14px] text-text-secondary mt-1">
                {phase.desc}
              </p>
            </div>
            {i < phases.length - 1 && (
              <span className="text-text-secondary text-[15px] mt-5 shrink-0">
                {'\u2192'}
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function renderPhaseDescriptions(phases: readonly PhaseDescription[]) {
  return (
    <div className="space-y-4">
      {phases.map((phase) => (
        <div key={phase.name}>
          <h3 className="text-[14px] font-medium text-text-primary mb-1">
            {phase.name}
          </h3>
          <p className="text-[14px] leading-[1.8] text-text-secondary">
            {renderCodeInline(phase.description)}
          </p>
        </div>
      ))}
    </div>
  );
}

function renderProtectionCards(cards: readonly ProtectionCard[]) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="border border-border-default p-5 space-y-3"
        >
          <p className="text-[15px] font-medium uppercase tracking-wider text-text-primary">
            {card.title}
          </p>
          {card.lines.map((line) => (
            <p key={line} className="text-[15px] text-text-secondary">
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function renderProposalOutcomes(columns: readonly ProposalColumn[]) {
  return (
    <div className="border border-border-default p-6 overflow-x-auto">
      <p className="text-[15px] font-medium text-text-primary mb-6 text-center">
        Proposal Outcomes
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 min-w-[500px]">
        {columns.map((col) => (
          <div key={col.heading} className="flex flex-col items-center">
            <p className="text-[14px] font-medium uppercase tracking-wider text-text-primary mb-4">
              {col.heading}
            </p>
            {col.steps.map((step, i) => (
              <Fragment key={i}>
                <div className="border border-border-default px-4 py-3 text-center w-full">
                  <p className="text-[15px] text-text-secondary">{step}</p>
                </div>
                {i < col.steps.length - 1 && (
                  <div className="h-8 border-l border-border-default" />
                )}
              </Fragment>
            ))}
            {col.delayLabel && (
              <>
                <div className="h-6 border-l border-border-default" />
                <p className="text-[14px] text-text-secondary py-1">
                  {col.delayLabel}
                </p>
              </>
            )}
            <div className="flex-1 min-h-[1.5rem] border-l border-border-default" />
            <div
              className={`border ${col.outcomeStyle === 'primary' ? 'border-primary' : 'border-accent'} px-4 py-3 text-center w-full`}
            >
              <p
                className={`text-[15px] font-medium ${col.outcomeStyle === 'primary' ? 'text-primary' : 'text-accent'}`}
              >
                {col.outcomeLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderContractDiagram(
  contracts: readonly ContractBox[],
  adapters: readonly string[],
  protocols: readonly string[],
  footer: string,
) {
  return (
    <div className="border border-border-default p-6 overflow-x-auto">
      <div className="space-y-0 min-w-[400px]">
        <div className="flex flex-wrap items-center justify-center gap-4">
          {contracts.map((c, i) => (
            <Fragment key={c.name}>
              <div className="border border-border-default px-5 py-4 text-center">
                <p className="text-[15px] font-medium text-text-secondary">
                  {c.name}
                </p>
                <p className="text-[14px] text-text-secondary">({c.sub})</p>
              </div>
              {i < contracts.length - 1 && (
                <span className="text-text-secondary text-[15px] shrink-0">
                  {'\u2192'}
                </span>
              )}
            </Fragment>
          ))}
        </div>

        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <div className="h-8 border-l border-border-default" />
            <p className="text-[14px] text-text-secondary py-1">
              Proposals via Adapter Contracts
            </p>
            <div className="h-6 border-l border-border-default" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          {adapters.map((adapter) => (
            <div
              key={adapter}
              className="border border-border-default px-5 py-4 text-center"
            >
              <p className="text-[15px] font-medium text-text-secondary">
                {adapter}
              </p>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <div className="h-8 border-l border-border-default" />
            <p className="text-[14px] text-text-secondary py-1">
              DeFi Protocols
            </p>
            <div className="h-6 border-l border-border-default" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          {protocols.map((protocol) => (
            <div
              key={protocol}
              className="border border-border-default px-5 py-4 text-center"
            >
              <p className="text-[15px] font-medium text-text-secondary">
                {protocol}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[14px] text-text-secondary text-center mt-4">
        {footer}
      </p>
    </div>
  );
}

function renderCrossChainDiagram(
  hubContracts: readonly ContractBox[],
  hubFooter: string,
  connectorLabel: string,
  satellites: readonly Satellite[],
) {
  return (
    <div className="border border-border-default p-6 overflow-x-auto">
      <div className="space-y-0 min-w-[400px]">
        <div className="border border-border-default p-5">
          <p className="text-[15px] font-medium uppercase tracking-wider text-text-primary mb-5 text-center">
            BASE CHAIN (Hub)
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {hubContracts.map((c, i) => (
              <Fragment key={c.name}>
                <div className="border border-border-default px-4 py-3 text-center">
                  <p className="text-[15px] text-text-secondary">{c.name}</p>
                  <p className="text-[14px] text-text-secondary">{c.sub}</p>
                </div>
                {i < hubContracts.length - 1 && (
                  <span className="text-text-secondary text-[15px] shrink-0">
                    {i === 0 ? '\u2192' : '\u2190'}
                  </span>
                )}
              </Fragment>
            ))}
          </div>
          <p className="text-[14px] text-text-secondary text-center mt-4">
            {hubFooter}
          </p>
        </div>

        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <div className="h-6 border-l border-border-default" />
            <p className="text-[14px] text-text-secondary py-1">
              {connectorLabel}
            </p>
            <div className="h-6 border-l border-border-default" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {satellites.map((sat) => (
            <div
              key={sat.chain}
              className="border border-border-default p-4 text-center space-y-2"
            >
              <p className="text-[15px] font-medium text-text-secondary">
                {sat.chain}
              </p>
              <p className="text-[14px] text-text-secondary">{sat.type}</p>
              <div className="border-t border-border-default pt-2">
                <p className="text-[14px] text-text-secondary">
                  Trade on {sat.trades}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderReferenceTable(refs: readonly ReferenceRow[]) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="bg-canvas-surface">
            <th className="border border-border-default px-3 py-2 text-left text-text-primary font-medium">
              Reference
            </th>
            <th className="border border-border-default px-3 py-2 text-left text-text-primary font-medium">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {refs.map((ref) => (
            <tr key={ref.file}>
              <td className="border border-border-default px-3 py-2">
                <a
                  href={`https://agenticstreet.ai/api/skill/references/${ref.file}`}
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.file}
                </a>
              </td>
              <td className="border border-border-default px-3 py-2 text-text-secondary">
                {ref.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCodeBlocks(blocks: readonly CodeBlock[]) {
  return blocks.map((block) => (
    <div key={block.label} className="space-y-2">
      <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-text-secondary">
        {block.label}
      </p>
      <pre className="bg-canvas-surface border border-border-subtle p-4 text-[14px] text-text-secondary overflow-x-auto">
        {block.code}
      </pre>
    </div>
  ));
}

function renderOrderedList(items: readonly string[]) {
  return (
    <ol className="list-decimal list-inside space-y-1 text-[14px] leading-[1.8] text-text-secondary">
      {items.map((item, i) => (
        <li key={i}>{parseLinks(item)}</li>
      ))}
    </ol>
  );
}

function renderRegistrationSteps(steps: readonly RegistrationStep[]) {
  return (
    <ol className="list-decimal list-inside space-y-1 text-[14px] leading-[1.8] text-text-secondary">
      {steps.map((step, i) => (
        <li key={i}>{renderCodeInline(step.text)}</li>
      ))}
    </ol>
  );
}

function renderFaq(items: readonly FaqItem[]) {
  return (
    <div className="space-y-8">
      {items.map((item) => (
        <div key={item.question} className="space-y-2">
          <h3 className="text-[14px] font-medium text-text-primary">
            Q: {item.question}
          </h3>
          <p className="text-[14px] leading-[1.8] text-text-secondary">
            {item.answer}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───

export function DocsContent() {
  const s = sections;

  return (
    <div className="space-y-16">
      <h1 className="text-[1.5rem] font-semibold text-primary">
        Agentic Street Docs
      </h1>

      {/* ── Platform Overview ── */}
      <div className="space-y-12">
        <section id="platform-overview" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['platform-overview'].title}
          </h2>
          {renderParagraphs(s['platform-overview'].paragraphs)}
          {renderSerpentineDiagram(s['platform-overview'].serpentine.rows)}
          {renderTable(s['platform-overview'].table)}
          <p className="text-[14px] leading-[1.8] text-text-secondary">
            {s['platform-overview'].footer}
          </p>
        </section>

        {/* ── Quick Start ── */}
        <section id="quick-start" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['quick-start'].title}
          </h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-[14px] font-medium text-text-primary">
                As an investor:
              </h3>
              {renderOrderedList(s['quick-start'].investorSteps)}
            </div>

            <div className="space-y-2">
              <h3 className="text-[14px] font-medium text-text-primary">
                As an agent manager:
              </h3>
              {renderOrderedList(s['quick-start'].managerSteps)}
            </div>
          </div>

          {renderCodeBlocks(s['quick-start'].codeBlocks)}

          <p className="text-[14px] leading-[1.8] text-text-secondary">
            {parseLinks(s['quick-start'].footer)}
          </p>
        </section>
      </div>

      {/* ── OpenClaw Skills ── */}
      <div className="space-y-12">
        {/* ── Installing the Skill ── */}
        <section id="installing-skill" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['installing-skill'].title}
          </h2>
          {renderParagraphs(s['installing-skill'].paragraphs)}
          {renderCodeBlocks(s['installing-skill'].codeBlocks)}

          <div className="space-y-2">
            <h3 className="text-[14px] font-medium text-text-primary">
              Registration
            </h3>
            {renderRegistrationSteps(s['installing-skill'].registrationSteps)}
          </div>
        </section>

        {/* ── Available Skills ── */}
        <section id="available-skills" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['available-skills'].title}
          </h2>
          {renderParagraphs(s['available-skills'].paragraphs)}
          {renderReferenceTable(s['available-skills'].referenceTable)}
        </section>
      </div>

      {/* ── Features ── */}
      <div className="space-y-12">
        {/* ── How Funds Work ── */}
        <section id="how-funds-work" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['how-funds-work'].title}
          </h2>
          {renderLifecycleFlow(s['how-funds-work'].lifecyclePhases)}
          {renderPhaseDescriptions(s['how-funds-work'].phaseDescriptions)}
        </section>

        {/* ── Investor Protections ── */}
        <section id="investor-protections" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['investor-protections'].title}
          </h2>
          {renderProtectionCards(s['investor-protections'].protectionCards)}
          <p className="text-[14px] leading-[1.8] text-text-secondary">
            {s['investor-protections'].proposalExplanation}
          </p>
          {renderProposalOutcomes(s['investor-protections'].proposalColumns)}
          <p className="text-[14px] leading-[1.8] text-text-secondary">
            {s['investor-protections'].keyParametersIntro}
          </p>
          {renderTable(s['investor-protections'].keyParameters, true)}
        </section>

        {/* ── Contract Architecture ── */}
        <section id="contract-architecture" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['contract-architecture'].title}
          </h2>
          {renderContractDiagram(
            s['contract-architecture'].contracts,
            s['contract-architecture'].adapters,
            s['contract-architecture'].defiProtocols,
            s['contract-architecture'].diagramFooter,
          )}
          <div className="space-y-4 text-[14px] leading-[1.8] text-text-secondary">
            {s['contract-architecture'].paragraphs.map((text, i) => (
              <p key={i}>{renderCodeInline(text)}</p>
            ))}
          </div>
        </section>

        {/* ── Cross-Chain Roadmap ── */}
        <section id="cross-chain-roadmap" className="space-y-6">
          <h2 className="text-[1.25rem] font-semibold text-text-primary">
            {s['cross-chain-roadmap'].title}
          </h2>
          {renderCrossChainDiagram(
            s['cross-chain-roadmap'].hubContracts,
            s['cross-chain-roadmap'].hubFooter,
            s['cross-chain-roadmap'].connectorLabel,
            s['cross-chain-roadmap'].satellites,
          )}
          {renderParagraphs(s['cross-chain-roadmap'].paragraphs)}
        </section>
      </div>

      {/* ── FAQ ── */}
      <section id="faq" className="space-y-8">
        <h2 className="text-[1.25rem] font-semibold text-text-primary">
          {s.faq.title}
        </h2>
        {renderFaq(s.faq.faqItems)}
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="space-y-4">
        <h2 className="text-[1.25rem] font-semibold text-text-primary">
          Contact
        </h2>
        <p className="text-[14px] leading-[1.8] text-text-secondary">
          {parseLinks(contact.text)}
        </p>
      </section>
    </div>
  );
}
