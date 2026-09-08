import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description: string;
}

function getOrCreateDescriptionMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.appendChild(meta);
  }
  return meta;
}

export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    const meta = getOrCreateDescriptionMeta();
    const previousDescription = meta.content;

    document.title = title;
    meta.content = description;

    return () => {
      document.title = previousTitle;
      meta.content = previousDescription;
    };
  }, [title, description]);
}
