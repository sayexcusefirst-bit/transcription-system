'use client';

import { X } from 'lucide-react';

const mapping = [
  { key: 'q', char: 'ु' }, { key: 'w', char: 'ू' }, { key: 'e', char: 'म' }, { key: 'r', char: 'त' }, { key: 't', char: 'ज' },
  { key: 'y', char: 'ल' }, { key: 'u', char: 'न' }, { key: 'i', char: 'प' }, { key: 'o', char: 'व' }, { key: 'p', char: 'च' },
  { key: 'a', char: 'ं' }, { key: 's', char: 'े' }, { key: 'd', char: 'क' }, { key: 'f', char: 'ि' }, { key: 'g', char: 'ह' },
  { key: 'h', char: 'ी' }, { key: 'j', char: 'र' }, { key: 'k', char: 'ा' }, { key: 'l', char: 'स' }, { key: ';', char: 'य' },
  { key: 'z', char: '्र' }, { key: 'x', char: 'ग' }, { key: 'c', char: 'ब' }, { key: 'v', char: 'अ' }, { key: 'b', char: 'इ' },
  { key: 'n', char: 'द' }, { key: 'm', char: 'उ' }, { key: ',', char: 'त' }, { key: '.', char: '़' }, { key: '/', char: 'य' },
];

export default function KeyboardReference({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
          <h2 className="text-xl font-black uppercase tracking-tighter">Keyboard Mapping Reference</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition-colors"><X size={20} /></button>
        </div>
        <div className="p-8 grid grid-cols-5 gap-4">
          {mapping.map((item) => (
            <div key={item.key} className="flex flex-col items-center p-3 bg-neutral-800 border border-neutral-700 rounded-xl hover:border-blue-500 transition-colors group">
              <span className="text-[10px] font-bold text-neutral-500 uppercase mb-1">{item.key}</span>
              <span className="text-2xl font-serif text-white group-hover:scale-125 transition-transform" style={{ fontFamily: 'KrishnaWide, serif' }}>{item.char}</span>
            </div>
          ))}
        </div>
        <div className="p-6 bg-neutral-950 border-t border-neutral-800 text-center">
            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Typical Remington / KrishnaWide Layout</p>
        </div>
      </div>
    </div>
  );
}
