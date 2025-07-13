export interface PopulationMeshData {
  MESH_ID: string;
  SHICODE: string;
  PTN_2020: number;
  PTN_2024: number;
  PT00_2024: number;
  coordinates: number[][];
}

export interface LandUseMeshData {
  L03b_001: string; // メッシュコード
  L03b_002: string; // 土地利用コード
  L03b_003: string; // 土地利用分類名
}

export interface SchoolFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: number[];
  };
  properties: {
    P29_001: string; // 学校コード
    P29_002: string; // 学校名
    P29_003: string; // 学校種別
    P29_004: string; // 設置者
    P29_005: string; // 所在地コード
    P29_006: string; // 所在地
    P29_007: string; // 備考
  };
}

export interface MedicalFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: number[];
  };
  properties: {
    P04_001: string; // 医療機関コード
    P04_002: string; // 医療機関名
    P04_003: string; // 医療機関種別
    P04_004: string; // 診療科目
    P04_007: string; // 救急告示
    P04_008: number; // 病床数
    P04_009: string; // 公的・私的
    P04_010: string; // 備考
  };
}

export const LAND_USE_COLORS: { [key: string]: string } = {
  "田": "#90EE90",
  "その他の農用地": "#FFE4B5",
  "森林": "#228B22",
  "荒地": "#D2B48C",
  "建物用地": "#FF6347",
  "道路": "#696969",
  "鉄道": "#2F4F4F",
  "その他の用地": "#DDA0DD",
  "河川地及び湖沼": "#87CEEB",
  "海浜": "#F0E68C",
  "海水域": "#4682B4",
  "ゴルフ場": "#32CD32",
  "解析範囲外": "#FFFFFF",
};