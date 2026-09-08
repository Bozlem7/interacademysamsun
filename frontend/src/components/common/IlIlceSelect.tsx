import { TURKEY_PROVINCES, districtsOf } from "../../lib/turkeyLocations";

const SORTED_PROVINCES = [...TURKEY_PROVINCES].sort((a, b) => a.il.localeCompare(b.il, "tr"));

export function IlIlceSelect({
  il,
  ilce,
  onIlChange,
  onIlceChange,
  className,
}: {
  il: string;
  ilce: string;
  onIlChange: (il: string) => void;
  onIlceChange: (ilce: string) => void;
  className?: string;
}) {
  const districts = districtsOf(il);

  return (
    <>
      <select
        className={className}
        value={il}
        onChange={(e) => {
          onIlChange(e.target.value);
          onIlceChange("");
        }}
      >
        <option value="">İl seçiniz</option>
        {SORTED_PROVINCES.map((p) => (
          <option key={p.il} value={p.il}>
            {p.il}
          </option>
        ))}
      </select>

      <select className={className} value={ilce} onChange={(e) => onIlceChange(e.target.value)} disabled={!il}>
        <option value="">{il ? "İlçe seçiniz" : "Önce il seçin"}</option>
        {districts.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </>
  );
}
