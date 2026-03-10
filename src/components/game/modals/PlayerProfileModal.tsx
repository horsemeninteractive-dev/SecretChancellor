import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Trophy, User as UserIcon, UserPlus, UserMinus } from 'lucide-react';
import { User } from '../../../types';
import { cn } from '../../../lib/utils';

interface PlayerProfileModalProps {
  userId: string;
  token: string;
  onClose: () => void;
  playSound: (sound: string) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({ userId, token, onClose, playSound }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`/api/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setIsFriend(data.isFriend);
        }
      } catch (err) {
        console.error("Failed to fetch user", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [userId, token]);

  const toggleFriend = async () => {
    playSound('click');
    try {
      if (isFriend) {
        await fetch(`/api/friends/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsFriend(false);
      } else {
        await fetch('/api/friends/request', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ targetUserId: userId })
        });
        // Assuming request sent successfully, we might want to show "Pending" state
        // But for now, let's just toggle
        setIsFriend(true);
      }
    } catch (err) {
      console.error("Failed to toggle friend", err);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-[#1a1a1a] border border-[#222] rounded-[2rem] p-8 shadow-2xl text-white"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-[#444] hover:text-white">
          <X className="w-6 h-6" />
        </button>
        
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl bg-[#222] border border-[#333] flex items-center justify-center overflow-hidden">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-12 h-12 text-[#444]" />
            )}
          </div>
          <h2 className="text-2xl font-thematic">{user.username}</h2>
          
          <div className="grid grid-cols-2 gap-4 w-full">
            <div className="bg-[#141414] p-3 rounded-xl border border-[#222] text-center">
              <div className="text-[10px] text-[#666] uppercase">ELO</div>
              <div className="text-lg font-serif italic text-yellow-500">{user.stats.elo}</div>
            </div>
            <div className="bg-[#141414] p-3 rounded-xl border border-[#222] text-center">
              <div className="text-[10px] text-[#666] uppercase">Wins</div>
              <div className="text-lg font-serif italic text-emerald-500">{user.stats.wins}</div>
            </div>
          </div>

          <button 
            onClick={toggleFriend}
            className={cn(
              "w-full py-3 rounded-xl font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
              isFriend ? "bg-[#222] text-white hover:bg-[#333]" : "bg-red-900 text-white hover:bg-red-800"
            )}
          >
            {isFriend ? <><UserMinus size={16} /> Remove Friend</> : <><UserPlus size={16} /> Add Friend</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
