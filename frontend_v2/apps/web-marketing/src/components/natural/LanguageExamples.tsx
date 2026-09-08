import { customerExperience } from '../../copy';

export function LanguageMobileStrip() {
  return (
    <p className="text-center text-[12px] leading-5 text-slate-600 lg:hidden">
      {customerExperience.languages.map((item, index) => (
        <span key={item.id}>
          {index > 0 ? <span className="px-1.5 text-slate-300">·</span> : null}
          <span className="font-medium text-primary-500">{item.label}</span>
        </span>
      ))}
    </p>
  );
}
