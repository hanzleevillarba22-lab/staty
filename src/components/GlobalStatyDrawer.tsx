import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageSquarePlus } from 'lucide-react';
import { assistantApi, datasetsApi } from '../lib/api.ts';
import { playDrawerClose, playDrawerOpen } from '../lib/soundEffects.ts';
import type { DatasetSummaryItem, NavRoute } from '../types/index.ts';
import { StatyChatPanel } from './StatyChatPanel.tsx';
import { StatyMascot } from './StatyMascot.tsx';

interface GlobalStatyDrawerProps {
  currentAppRoute: NavRoute;
  onWorkspaceChanged: () => void;
  onNavigate: (route: NavRoute, contextLabel?: string) => void;
}

export const GlobalStatyDrawer: React.FC<GlobalStatyDrawerProps> = ({
  currentAppRoute,
  onWorkspaceChanged,
  onNavigate,
}) => {
  const [open, setOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [datasets, setDatasets] = useState<DatasetSummaryItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | ''>('');
  const [activeConvId, setActiveConvId] = useState<number | null>(null);

  const loadDrawerContext = useCallback(async () => {
    try {
      const [statusRes, convRes, dsRes] = await Promise.all([
        assistantApi.status(),
        assistantApi.listConversations(),
        datasetsApi.list(),
      ]);
      setAiConfigured(statusRes.configured);
      setStatusMessage(statusRes.message);
      setDatasets(dsRes.datasets);
      setActiveConvId((prev) => prev ?? (convRes.conversations[0]?.id ?? null));
    } catch {
      // ignore background drawer fetch errors
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDrawerContext();
    }
  }, [open, loadDrawerContext]);

  const handleOpen = () => {
    playDrawerOpen();
    setOpen(true);
  };

  const handleClose = () => {
    playDrawerClose();
    setOpen(false);
  };

  if (currentAppRoute === 'ai-assistant') {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="staty-fab"
            type="button"
            initial={{ opacity: 0, scale: 0.75, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.75, y: 18 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            onClick={handleOpen}
            aria-label="Open STATY AI anywhere"
            className="fixed bottom-5 right-5 z-40 group flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg hover:border-[#2563EB] transition-colors cursor-pointer"
          >
            <StatyMascot
              variant="head"
              expression="happy"
              gesture="wave-wink"
              size="xs"
              interactive={false}
            />
            <div className="text-left">
              <p className="font-display text-xs font-bold text-[#173B75] dark:text-white leading-tight">
                Ask STATY
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Use anywhere
              </p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="staty-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]"
          >
            <div className="flex-1" onClick={handleClose} aria-hidden="true" />
            <motion.aside
              key="staty-drawer-panel"
              initial={{ x: '100%', scale: 0.98 }}
              animate={{ x: 0, scale: 1 }}
              exit={{ x: '100%', scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              aria-label="STATY Everywhere Assistant"
              className="w-full sm:w-[440px] md:w-[480px] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
            >
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-[#F8FAFC] dark:bg-slate-950/50 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  STATY AI Assistant
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      playDrawerOpen();
                      const res = await assistantApi.createConversation('New Research Chat');
                      setActiveConvId(res.conversation.id);
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>New Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onNavigate('ai-assistant');
                    }}
                    className="font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  >
                    Full View
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <StatyChatPanel
                  compact
                  currentAppRoute={currentAppRoute}
                  activeConvId={activeConvId}
                  onConvReady={(id) => setActiveConvId(id)}
                  datasets={datasets}
                  selectedDatasetId={selectedDatasetId}
                  onSelectDataset={setSelectedDatasetId}
                  aiConfigured={aiConfigured}
                  statusMessage={statusMessage}
                  onWorkspaceChanged={() => {
                    onWorkspaceChanged();
                    window.dispatchEvent(new CustomEvent('statlytics:workspace-updated'));
                  }}
                  onNavigate={(route, ctx) => {
                    onNavigate(route, ctx);
                    if (route === 'ai-assistant') setOpen(false);
                  }}
                  onConversationsRefresh={loadDrawerContext}
                  onCloseDrawer={handleClose}
                />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
