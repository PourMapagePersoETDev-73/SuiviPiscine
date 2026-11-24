import { User } from "firebase/auth";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  DEFAULT_POOL_PROFILE,
  INITIAL_MEASUREMENTS,
  INITIAL_PRODUCTS,
  INITIAL_TREATMENTS,
} from "../data/poolCatalog";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  ParameterKey,
  PoolProduct,
  PoolProfile,
  SharedPoolRecord,
  TreatmentLogEntry,
  WaterMeasurement,
} from "../types/pool";

function cleanAuthorName(user: User): string {
  const raw =
    user.displayName?.trim() ||
    (user.email ? user.email.split("@")[0] : "") ||
    "Membre";
  return raw.slice(0, 80);
}

function randomAlnum(length: number): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function makePoolId(): string {
  return `piscine-48m3-${randomAlnum(12)}`;
}

function makeDocId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomAlnum(8)}`;
}

function sanitizeValuesMap(
  values: Partial<Record<ParameterKey, number>>
): Partial<Record<ParameterKey, number>> {
  const allowed: ParameterKey[] = [
    "freeChlorine",
    "totalChlorine",
    "ph",
    "alkalinity",
    "totalHardness",
    "stabilizer",
  ];
  const out: Partial<Record<ParameterKey, number>> = {};
  for (const k of allowed) {
    const val = values[k];
    if (typeof val === "number" && Number.isFinite(val)) {
      out[k] = val;
    }
  }
  return out;
}

export function extractPoolCode(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.includes("://") || trimmed.includes("pool=")) {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://example.com/?${trimmed}`
      );
      const param = url.searchParams.get("pool");
      if (param) return param.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    }
  } catch {
    // Fallback to raw cleanup
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function subscribeUserPools(
  uid: string,
  onData: (pools: SharedPoolRecord[]) => void,
  onError: (err: unknown) => void
) {
  const path = "pools";
  const q = query(
    collection(db, path),
    where("memberIds", "array-contains", uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: SharedPoolRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || "Piscine"),
          volumeM3: Number(data.volumeM3 || 48),
          coating: data.coating || "liner",
          disinfectant: data.disinfectant === "sel" ? "sel" : "chlore",
          temperatureC: Number(data.temperatureC ?? 25),
          visualState: data.visualState || "limpide",
          ownerId: String(data.ownerId || ""),
          memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
        };
      });
      onData(list);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createSharedPool(
  user: User,
  profile: PoolProfile = DEFAULT_POOL_PROFILE,
  seedStarterData: boolean = true
): Promise<string> {
  const poolId = makePoolId();
  const poolPath = `pools/${poolId}`;
  const memberIds = [user.uid];
  const authorName = cleanAuthorName(user);

  try {
    // 1. Create the parent pool document first so subcollection security rules
    // can resolve exists(/pools/{poolId}) and get(/pools/{poolId}).data.memberIds.
    await setDoc(doc(db, "pools", poolId), {
      name: profile.name.trim().slice(0, 80) || "Piscine Jardin",
      volumeM3: Math.max(1, Math.min(500, Number(profile.volumeM3) || 48)),
      coating: profile.coating,
      disinfectant: profile.disinfectant,
      temperatureC: Math.max(0, Math.min(45, Number(profile.temperatureC) || 26)),
      visualState: profile.visualState,
      ownerId: user.uid,
      memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Seed starter products, measurements, and treatments in a batch
    const batch = writeBatch(db);

    for (const p of INITIAL_PRODUCTS) {
      const prodRef = doc(db, "pools", poolId, "products", p.id);
      batch.set(prodRef, {
        poolId,
        authorId: user.uid,
        memberIds,
        name: p.name.slice(0, 100),
        ...(p.brand ? { brand: p.brand.slice(0, 80) } : {}),
        category: p.category,
        quantity: p.quantity,
        maxQuantity: p.maxQuantity,
        unit: p.unit,
        lowThreshold: p.lowThreshold,
        dosageGuide: p.dosageGuide.slice(0, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (seedStarterData) {
      for (const m of INITIAL_MEASUREMENTS) {
        const mRef = doc(db, "pools", poolId, "measurements", m.id);
        batch.set(mRef, {
          poolId,
          authorId: user.uid,
          authorName,
          memberIds,
          timestamp: m.timestamp,
          source: m.source,
          ...(m.stripProfile ? { stripProfile: m.stripProfile } : {}),
          ...(m.temperature !== undefined ? { temperature: m.temperature } : {}),
          values: sanitizeValuesMap(m.values),
          ...(m.notes ? { notes: m.notes.slice(0, 300) } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      for (const t of INITIAL_TREATMENTS) {
        const tRef = doc(db, "pools", poolId, "treatments", t.id);
        batch.set(tRef, {
          poolId,
          authorId: user.uid,
          authorName,
          memberIds,
          timestamp: t.timestamp,
          ...(t.productId ? { productId: t.productId } : {}),
          productName: t.productName.slice(0, 100),
          category: t.category,
          amount: t.amount,
          unit: t.unit.slice(0, 30),
          reason: t.reason.slice(0, 240),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return poolId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, poolPath);
  }
}

export async function joinSharedPool(
  user: User,
  rawCode: string
): Promise<string> {
  const poolId = extractPoolCode(rawCode);
  if (!poolId || !/^[a-zA-Z0-9_-]{4,128}$/.test(poolId)) {
    throw new Error("Code bassin invalide. Vérifiez le lien ou le code partagé.");
  }
  const path = `pools/${poolId}`;
  try {
    await updateDoc(doc(db, "pools", poolId), {
      memberIds: arrayUnion(user.uid),
      updatedAt: serverTimestamp(),
    });
    return poolId;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("No document to update") || msg.includes("not-found")) {
      throw new Error(
        "Aucun bassin trouvé avec ce code. Vérifiez le code auprès du créateur."
      );
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncPoolMembersToSubcollections(
  poolId: string,
  uid: string,
  memberIds: string[]
) {
  const subcollections = ["measurements", "products", "treatments"] as const;
  try {
    const batch = writeBatch(db);
    let updateCount = 0;

    for (const sub of subcollections) {
      const snap = await getDocs(
        query(
          collection(db, "pools", poolId, sub),
          where("memberIds", "array-contains", uid)
        )
      );
      for (const d of snap.docs) {
        const existingMembers: string[] = Array.isArray(d.data().memberIds)
          ? d.data().memberIds
          : [];
        const missing = memberIds.some((m) => !existingMembers.includes(m));
        if (missing) {
          batch.update(d.ref, {
            memberIds,
            updatedAt: serverTimestamp(),
          });
          updateCount++;
        }
      }
    }

    if (updateCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `pools/${poolId}`);
  }
}

export function subscribePoolSubcollections(
  poolId: string,
  uid: string,
  handlers: {
    onMeasurements: (items: WaterMeasurement[]) => void;
    onProducts: (items: PoolProduct[]) => void;
    onTreatments: (items: TreatmentLogEntry[]) => void;
    onError: (err: unknown) => void;
  }
) {
  const mPath = `pools/${poolId}/measurements`;
  const pPath = `pools/${poolId}/products`;
  const tPath = `pools/${poolId}/treatments`;

  const unsubM = onSnapshot(
    query(collection(db, mPath), where("memberIds", "array-contains", uid)),
    (snap) => {
      const items: WaterMeasurement[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            timestamp: String(data.timestamp),
            source: data.source === "camera" ? "camera" : "manuel",
            stripProfile: data.stripProfile,
            temperature:
              typeof data.temperature === "number" ? data.temperature : undefined,
            values: data.values || {},
            notes: data.notes,
            authorName: data.authorName,
          } as WaterMeasurement;
        })
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      handlers.onMeasurements(items);
    },
    (err) => {
      handlers.onError(err);
      handleFirestoreError(err, OperationType.LIST, mPath);
    }
  );

  const unsubP = onSnapshot(
    query(collection(db, pPath), where("memberIds", "array-contains", uid)),
    (snap) => {
      const items: PoolProduct[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name),
            brand: data.brand,
            category: data.category,
            quantity: Number(data.quantity ?? 0),
            maxQuantity: Number(data.maxQuantity ?? 1),
            unit: data.unit,
            lowThreshold: Number(data.lowThreshold ?? 0),
            dosageGuide: String(data.dosageGuide || ""),
          } as PoolProduct;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      handlers.onProducts(items);
    },
    (err) => {
      handlers.onError(err);
      handleFirestoreError(err, OperationType.LIST, pPath);
    }
  );

  const unsubT = onSnapshot(
    query(collection(db, tPath), where("memberIds", "array-contains", uid)),
    (snap) => {
      const items: TreatmentLogEntry[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            timestamp: String(data.timestamp),
            productId: data.productId,
            productName: String(data.productName),
            category: data.category,
            amount: Number(data.amount ?? 0),
            unit: String(data.unit || ""),
            reason: String(data.reason || ""),
            authorName: data.authorName,
          } as TreatmentLogEntry;
        })
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      handlers.onTreatments(items);
    },
    (err) => {
      handlers.onError(err);
      handleFirestoreError(err, OperationType.LIST, tPath);
    }
  );

  return () => {
    unsubM();
    unsubP();
    unsubT();
  };
}

export async function updatePoolSettingsFs(
  poolId: string,
  updates: Partial<PoolProfile>
) {
  const path = `pools/${poolId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.name !== undefined) {
      payload.name = updates.name.trim().slice(0, 80) || "Piscine";
    }
    if (updates.volumeM3 !== undefined) {
      payload.volumeM3 = Math.max(1, Math.min(500, updates.volumeM3));
    }
    if (updates.coating !== undefined) payload.coating = updates.coating;
    if (updates.disinfectant !== undefined) {
      payload.disinfectant = updates.disinfectant;
    }
    if (updates.temperatureC !== undefined) {
      payload.temperatureC = Math.max(0, Math.min(45, updates.temperatureC));
    }
    if (updates.visualState !== undefined) {
      payload.visualState = updates.visualState;
    }
    await updateDoc(doc(db, "pools", poolId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addMeasurementFs(
  poolId: string,
  user: User,
  memberIds: string[],
  measurement: WaterMeasurement
) {
  const id = makeDocId("m");
  const path = `pools/${poolId}/measurements/${id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "pools", poolId, "measurements", id), {
      poolId,
      authorId: user.uid,
      authorName: cleanAuthorName(user),
      memberIds,
      timestamp: measurement.timestamp,
      source: measurement.source,
      ...(measurement.stripProfile
        ? { stripProfile: measurement.stripProfile.slice(0, 40) }
        : {}),
      ...(measurement.temperature !== undefined
        ? {
            temperature: Math.max(0, Math.min(45, measurement.temperature)),
          }
        : {}),
      values: sanitizeValuesMap(measurement.values),
      ...(measurement.notes
        ? { notes: measurement.notes.trim().slice(0, 300) }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (measurement.temperature !== undefined) {
      batch.update(doc(db, "pools", poolId), {
        temperatureC: Math.max(0, Math.min(45, measurement.temperature)),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteMeasurementFs(poolId: string, measurementId: string) {
  const path = `pools/${poolId}/measurements/${measurementId}`;
  try {
    await deleteDoc(doc(db, "pools", poolId, "measurements", measurementId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addProductFs(
  poolId: string,
  user: User,
  memberIds: string[],
  product: PoolProduct
) {
  const id = makeDocId("prod");
  const path = `pools/${poolId}/products/${id}`;
  try {
    await setDoc(doc(db, "pools", poolId, "products", id), {
      poolId,
      authorId: user.uid,
      memberIds,
      name: product.name.trim().slice(0, 100),
      ...(product.brand ? { brand: product.brand.trim().slice(0, 80) } : {}),
      category: product.category,
      quantity: Math.max(0, Math.min(10000, product.quantity)),
      maxQuantity: Math.max(0.1, Math.min(10000, product.maxQuantity)),
      unit: product.unit,
      lowThreshold: Math.max(0, Math.min(1000, product.lowThreshold)),
      dosageGuide: product.dosageGuide.trim().slice(0, 300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProductStockFs(
  poolId: string,
  product: PoolProduct,
  nextQuantity: number
) {
  const path = `pools/${poolId}/products/${product.id}`;
  const clampedQty = Math.max(0, Math.min(10000, nextQuantity));
  try {
    await updateDoc(doc(db, "pools", poolId, "products", product.id), {
      quantity: clampedQty,
      maxQuantity: Math.max(0.1, product.maxQuantity, clampedQty),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductFs(poolId: string, productId: string) {
  const path = `pools/${poolId}/products/${productId}`;
  try {
    await deleteDoc(doc(db, "pools", poolId, "products", productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addTreatmentFs(
  poolId: string,
  user: User,
  memberIds: string[],
  entry: TreatmentLogEntry,
  deductProduct?: { product: PoolProduct; amountToDeduct: number }
) {
  const id = makeDocId("t");
  const path = `pools/${poolId}/treatments/${id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "pools", poolId, "treatments", id), {
      poolId,
      authorId: user.uid,
      authorName: cleanAuthorName(user),
      memberIds,
      timestamp: entry.timestamp,
      ...(entry.productId ? { productId: entry.productId.slice(0, 128) } : {}),
      productName: entry.productName.trim().slice(0, 100),
      category: entry.category,
      amount: Math.max(0.01, Math.min(10000, entry.amount)),
      unit: entry.unit.trim().slice(0, 30),
      reason: entry.reason.trim().slice(0, 240),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (deductProduct) {
      const nextQty = Math.max(
        0,
        Number(
          (deductProduct.product.quantity - deductProduct.amountToDeduct).toFixed(2)
        )
      );
      batch.update(
        doc(db, "pools", poolId, "products", deductProduct.product.id),
        {
          quantity: nextQty,
          updatedAt: serverTimestamp(),
        }
      );
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteTreatmentFs(poolId: string, treatmentId: string) {
  const path = `pools/${poolId}/treatments/${treatmentId}`;
  try {
    await deleteDoc(doc(db, "pools", poolId, "treatments", treatmentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
