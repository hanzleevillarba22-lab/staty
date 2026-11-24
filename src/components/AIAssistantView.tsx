import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { assistantApi, datasetsApi } from '../lib/api.ts';
import type { DatasetSummaryItem, NavRoute } from '../types/index.ts';
import { StatyChatPanel } from './StatyChatPanel.tsx';
import { StatyMascot } from './StatyMascot.tsx';

interface AIAssistantViewProps {
  onWorkspaceChanged?: () => void;
  onNavigate?: (route: NavRoute, contextLabel?: string) => void;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  onWorkspaceChanged,
  onNavigate,
}) => {
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [conversations, setConversations] = useState<
    Array<{ id: number; title: string; message_count: number; updated_at: string }>
  >([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummaryItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | ''>('');

  const loadSidebarData = useCallback(async () => {
    try {
      const [statusRes, convRes, dsRes] = await Promise.all([
        assistantApi.status(),
        assistantApi.listConversations(),
        datasetsApi.list(),
      ]);
      setAiConfigured(statusRes.configured);
      setStatusMessage(statusRes.message);
      setConversations(convRes.conversations);
      setDatasets(dsRes.datasets);
      setActiveConvId((prev) => prev ?? (convRes.conversations[0]?.id ?? null));
    } catch {
      // handled in child
    }
  }, []);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData]);

  const handleNewChat = async () => {
    const res = await assistantApi.createConversation('New Research Chat');
    await loadSidebarData();
    setActiveConvId(res.conversation.id);
  };

  const handleDeleteChat = async (id: number) => {
    await assistantApi.deleteConversation(id);
    if (activeConvId === id) {
      setActiveConvId(null);
    }
    await loadSidebarData();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[75vh]">
      {/* Left Conversation History Sidebar */}
      <aside className="lg:col-span-4 xl:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <StatyMascot variant="head" expression="happy" gesture="wave-wink" size="sm" />
          <div className="min-w-0">
            <h1 className="font-display text-base font-bold text-[#173B75] dark:text-white">
              STATY AI Assistant
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Research Analytics Assistant
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleNewChat}
          className="min-h-[44px] w-full px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-400 px-1">Saved Conversations</p>
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-400 px-1 py-2">No saved conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition-colors ${
                  activeConvId === c.id
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-[#173B75] dark:text-blue-200 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveConvId(c.id)}
                  className="flex-1 text-left truncate min-h-[32px] cursor-pointer"
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteChat(c.id)}
                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Real-Time Streaming Head-Only Chat Workspace */}
      <section className="lg:col-span-8 xl:col-span-9 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh]">
        <StatyChatPanel
          currentAppRoute="ai-assistant"
          activeConvId={activeConvId}
          onConvReady={(id) => setActiveConvId(id)}
          datasets={datasets}
          selectedDatasetId={selectedDatasetId}
          onSelectDataset={setSelectedDatasetId}
          aiConfigured={aiConfigured}
          statusMessage={statusMessage}
          onWorkspaceChanged={onWorkspaceChanged}
          onNavigate={onNavigate}
          onConversationsRefresh={loadSidebarData}
        />
      </section>
    </div>
  );
};
