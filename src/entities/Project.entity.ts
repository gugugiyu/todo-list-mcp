/**
 * Project.entity.ts
 *
 * TypeORM Entity for Project table.
 * This entity maps to the projects table in the database.
 */
import { Entity, PrimaryColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User.entity.js';
import { Todo } from './Todo.entity.js';

@Entity('projects')
export class Project {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  username!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  createdAt!: string;

  @Column({ type: 'text' })
  updatedAt!: string;

  // Relationships
  @ManyToOne(() => User, user => user.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'username' })
  user!: User;

  @OneToMany(() => Todo, todo => todo.project)
  todos!: Todo[];
}
