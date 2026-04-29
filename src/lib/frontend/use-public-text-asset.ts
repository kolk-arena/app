'use client';

import { useEffect, useState } from 'react';

export function usePublicTextAsset(path: string) {
  const [content, setContent] = useState('');

  useEffect(() => {
    let active = true;

    void fetch(path, { cache: 'force-cache' })
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (!active) return;
        setContent(text);
      })
      .catch(() => {
        if (!active) return;
        setContent('');
      });

    return () => {
      active = false;
    };
  }, [path]);

  return content;
}
