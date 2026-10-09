import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Inventory, Order, OrderInput, Pet, PetInput, PetStatus } from './models';
@Injectable({ providedIn: 'root' })
export class PetstoreApiService {
  private readonly http = inject(HttpClient);
  pets() {
    return this.http.get<Pet[]>('/pet');
  }
  byStatus(status: PetStatus) {
    return this.http.get<Pet[]>('/pet/findByStatus', {
      params: new HttpParams().set('status', status),
    });
  }
  byTag(tag: string) {
    return this.http.get<Pet[]>('/pet/findByTags', { params: new HttpParams().set('tags', tag) });
  }
  pet(id: number) {
    return this.http.get<Pet>(`/pet/${id}`);
  }
  createPet(pet: PetInput) {
    return this.http.post<Pet>('/pet', pet);
  }
  updatePet(pet: Pet) {
    return this.http.put<Pet>('/pet', pet);
  }
  deletePet(id: number) {
    return this.http.delete<void>(`/pet/${id}`);
  }
  inventory() {
    return this.http.get<Inventory>('/store/inventory');
  }
  createOrder(order: OrderInput) {
    return this.http.post<Order>('/store/order', order);
  }
  orders() {
    return this.http.get<Order[]>('/store/order');
  }
  order(id: number) {
    return this.http.get<Order>(`/store/order/${id}`);
  }
  deleteOrder(id: number) {
    return this.http.delete<void>(`/store/order/${id}`);
  }
  seed() {
    return this.http.post<{ pets: number; orders: number; inventory: Inventory }>(
      '/training/seed',
      null,
    );
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) return 'This record could not be found. It may have been deleted.';
    if (error.status === 409)
      return 'This pet has an order. Delete its referencing orders before deleting the pet.';
    if (error.status === 400) return 'Check your entries and try again.';
  }
  return 'We could not complete the request. Check your connection and try again.';
}
