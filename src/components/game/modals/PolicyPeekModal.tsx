import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, Scale } from 'lucide-react';
import { Policy } from '../../../types';
import { cn } from '../../../lib/utils';

interface PolicyPeekModalProps {
  policies: Policy[] | null;
  onClose: () => void;
}

export const PolicyPeekModal = ({ policies, onClose }: PolicyPeekModalProps) => (
  <AnimatePresence>
    {policies && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="max-w-md w-full bg-[#1a1a1a] border border-[#333] rounded-3xl p-8 text-center space-y-8 shadow-2xl"
        >
          <div className="space-y-2">
            <div className="w-12 h-12 bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto border border-yellow-900/50 mb-4">
              <Eye className="w-6 h-6 text-yellow-500" />
            </div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Directive Preview</h3>
            <p className="text-lg font-serif italic text-white">Top 3 directives in the deck:</p>
          </div>
          <div className="flex justify-center gap-4">
            {policies.map((p, i) => (
              <motion.div
                key={i}
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ delay: i * 0.2 }}
                className={cn(
                  'w-20 h-28 rounded-xl border-2 flex flex-col items-center justify-center gap-2 shadow-xl',
                  p === 'Civil'
                    ? 'bg-blue-900/20 border-blue-500/50 text-blue-400'
                    : 'bg-red-900/20 border-red-500/50 text-red-500'
                )}
              >
                {p === 'Civil' ? <Scale className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                <span className="text-[8px] font-mono uppercase tracking-widest">
                  {p === 'Civil' ? 'Civil' : 'State'}
                </span>
              </motion.div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all text-sm font-serif italic border border-[#333]"
          >
            End Peek
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
