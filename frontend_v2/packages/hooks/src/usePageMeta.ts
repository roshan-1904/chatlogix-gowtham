import { useEffect } from 'react';

export interface PageMeta {
  title: string;
  description: string;
  canonical?: string;
  robots?: string;
  ogType?: string;
}

function getOrCreateMeta(attr: 'name' | 'property', key: string): HTMLMetaElement {
  const selector = `meta[${attr}="${key}"]`;
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  return meta;
}

function getOrCreateLink(rel: string): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function snapshot(el: HTMLMetaElement | HTMLLinkElement): string {
  return el instanceof HTMLMetaElement ? el.content : el.href;
}

function restore(el: HTMLMetaElement | HTMLLinkElement, value: string): void {
  if (el instanceof HTMLMetaElement) {
    el.content = value;
    return;
  }
  el.href = value;
}

export function usePageMeta({
  title,
  description,
  canonical,
  robots,
  ogType = 'website',
}: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title;
    const desc = getOrCreateMeta('name', 'description');
    const robotsMeta = getOrCreateMeta('name', 'robots');
    const ogTitle = getOrCreateMeta('property', 'og:title');
    const ogDesc = getOrCreateMeta('property', 'og:description');
    const ogTypeMeta = getOrCreateMeta('property', 'og:type');
    const ogUrl = getOrCreateMeta('property', 'og:url');
    const ogSite = getOrCreateMeta('property', 'og:site_name');
    const twitterTitle = getOrCreateMeta('name', 'twitter:title');
    const twitterDesc = getOrCreateMeta('name', 'twitter:description');
    const twitterCard = getOrCreateMeta('name', 'twitter:card');
    const canonicalLink = getOrCreateLink('canonical');

    const previous = {
      desc: snapshot(desc),
      robots: snapshot(robotsMeta),
      ogTitle: snapshot(ogTitle),
      ogDesc: snapshot(ogDesc),
      ogType: snapshot(ogTypeMeta),
      ogUrl: snapshot(ogUrl),
      ogSite: snapshot(ogSite),
      twitterTitle: snapshot(twitterTitle),
      twitterDesc: snapshot(twitterDesc),
      twitterCard: snapshot(twitterCard),
      canonical: snapshot(canonicalLink),
    };

    document.title = title;
    desc.content = description;
    ogTitle.content = title;
    ogDesc.content = description;
    ogTypeMeta.content = ogType;
    ogSite.content = 'ChatLogix';
    twitterTitle.content = title;
    twitterDesc.content = description;
    if (!twitterCard.content) {
      twitterCard.content = 'summary';
    }
    if (robots) {
      robotsMeta.content = robots;
    }
    if (canonical) {
      ogUrl.content = canonical;
      canonicalLink.href = canonical;
    }

    return () => {
      document.title = previousTitle;
      restore(desc, previous.desc);
      restore(robotsMeta, previous.robots);
      restore(ogTitle, previous.ogTitle);
      restore(ogDesc, previous.ogDesc);
      restore(ogTypeMeta, previous.ogType);
      restore(ogUrl, previous.ogUrl);
      restore(ogSite, previous.ogSite);
      restore(twitterTitle, previous.twitterTitle);
      restore(twitterDesc, previous.twitterDesc);
      restore(twitterCard, previous.twitterCard);
      restore(canonicalLink, previous.canonical);
    };
  }, [title, description, canonical, robots, ogType]);
}
